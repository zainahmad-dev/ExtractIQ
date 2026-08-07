-- ExtractIQ initial schema
-- Tables: documents, document_extractions, line_items, exports, processing_logs
-- Storage: documents bucket (private; access via signed URLs from server-side code)

create extension if not exists "pgcrypto";

-- documents ------------------------------------------------------------------
-- documents.status is the canonical 9-state pipeline enum, formalized as a TS
-- union in types/status.ts in Phase 4. The check constraint here is the source
-- of truth for the allowed values; Phase 4 must match this shape exactly.
create table documents (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  file_path text not null,
  file_size bigint not null,
  mime_type text not null,
  status text not null default 'queued'
    constraint documents_status_check check (
      status in (
        'queued',
        'processing',
        'extracting_text',
        'running_ocr',
        'running_llm',
        'validating',
        'awaiting_review',
        'completed',
        'needs_manual_entry'
      )
    ),
  status_history jsonb not null default '[]'::jsonb,
  error_reason text,
  processing_confidence numeric(5, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_status_idx on documents (status);
create index documents_created_at_idx on documents (created_at);

-- document_extractions ---------------------------------------------------------
-- One row per extraction "draft" for a document. review_status is the second
-- canonical enum formalized in Phase 4; the check constraint is the source of
-- truth for allowed values.
create table document_extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  review_status text not null default 'pending_review'
    constraint document_extractions_review_status_check check (
      review_status in ('pending_review', 'approved', 'rejected')
    ),

  -- Extracted header fields (kept as real columns, not just JSON, so Records
  -- filtering and Analytics aggregation in later phases can query them directly)
  vendor_name text,
  document_number text,
  document_date date,
  currency text,
  subtotal_amount numeric(12, 2),
  tax_amount numeric(12, 2),
  total_amount numeric(12, 2),

  -- Full pipeline output, preserved verbatim
  raw_text text,
  extracted_data jsonb,

  -- Confidence signals (Phases 15-16)
  field_confidence jsonb,
  ocr_quality_score numeric(5, 2),
  schema_valid boolean,
  missing_fields jsonb,
  overall_confidence numeric(5, 2),

  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index document_extractions_document_id_idx on document_extractions (document_id);
create index document_extractions_review_status_idx on document_extractions (review_status);
create index document_extractions_vendor_name_idx on document_extractions (vendor_name);
create index document_extractions_document_date_idx on document_extractions (document_date);

-- line_items -------------------------------------------------------------------
-- draft_id references document_extractions.id (an extraction draft), not
-- documents.id, per Phase 3's explicit requirement.
create table line_items (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references document_extractions (id) on delete cascade,
  description text,
  quantity numeric(12, 2),
  unit_price numeric(12, 2),
  amount numeric(12, 2),
  created_at timestamptz not null default now()
);

create index line_items_draft_id_idx on line_items (draft_id);

-- exports ------------------------------------------------------------------------
create table exports (
  id uuid primary key default gen_random_uuid(),
  format text not null
    constraint exports_format_check check (format in ('csv', 'json')),
  filters jsonb not null default '{}'::jsonb,
  record_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- processing_logs -----------------------------------------------------------------
create table processing_logs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  step text not null,
  status text not null,
  duration_ms integer,
  message text,
  created_at timestamptz not null default now()
);

create index processing_logs_document_id_idx on processing_logs (document_id);

-- updated_at maintenance -----------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger documents_set_updated_at
  before update on documents
  for each row execute function set_updated_at();

create trigger document_extractions_set_updated_at
  before update on document_extractions
  for each row execute function set_updated_at();

-- Row Level Security ----------------------------------------------------------------
-- The app has no end-user auth; all reads/writes go through Next.js API routes
-- using the Supabase service-role key (lib/storage/supabase.ts), which bypasses
-- RLS. RLS is enabled with no policies so the anon/public PostgREST API cannot
-- read or write these tables directly.
alter table documents enable row level security;
alter table document_extractions enable row level security;
alter table line_items enable row level security;
alter table exports enable row level security;
alter table processing_logs enable row level security;

-- Storage --------------------------------------------------------------------------
-- Private bucket for uploaded source files (pdf/png/jpg). Served via signed URLs
-- generated server-side, never exposed directly to the browser.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
