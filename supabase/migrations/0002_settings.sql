-- Workspace-wide application settings.
--
-- This app has no per-user auth (see 0001_init.sql's RLS note), so every
-- setting is a shared policy rather than a personal preference: the
-- confidence threshold decides which fields the Review screen flags, and two
-- reviewers must see the identical flagging on the identical document.
--
-- Deliberately a singleton, not a multi-tenant or per-user table: the boolean
-- primary key defaults to true and is CHECK-constrained to true, so the table
-- can physically hold at most one row.

create table app_settings (
  id boolean primary key default true
    constraint app_settings_singleton_check check (id),

  -- Field confidence below this (0-100) is flagged for attention in Review.
  -- The default matches Phase 2's ConfidenceBadge red band, so an untouched
  -- install flags exactly what it flagged before this table existed.
  confidence_threshold integer not null default 85
    constraint app_settings_confidence_threshold_check
      check (confidence_threshold between 0 and 100),

  -- Must stay in sync with exports.format's allowed values in 0001_init.sql.
  default_export_format text not null default 'csv'
    constraint app_settings_default_export_format_check
      check (default_export_format in ('csv', 'json')),

  updated_at timestamptz not null default now()
);

-- Seed the one row so a fresh install reads real defaults rather than nothing.
insert into app_settings (id) values (true) on conflict (id) do nothing;

-- set_updated_at() is defined in 0001_init.sql.
create trigger app_settings_set_updated_at
  before update on app_settings
  for each row execute function set_updated_at();

-- Same posture as every other table: no policies, so the anon/public PostgREST
-- API can't touch it. All access goes through Next.js API routes using the
-- service-role key.
alter table app_settings enable row level security;

-- Granted explicitly rather than relying on the schema's default privileges,
-- which don't reach service_role depending on which role runs the migration.
-- Only service_role is granted: RLS above already blocks anon/authenticated,
-- and the API routes are the sole intended caller.
grant select, insert, update on table app_settings to service_role;
