import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiErrorHandler } from '@/lib/api-error-handler';
import { getSupabaseAdminClient } from '@/lib/storage/supabase';
import {
  RECORDS_SORT_FIELDS,
  RECORDS_STATUS_FILTERS,
  type RecordItem,
  type RecordsResponse,
  type RecordsSortField,
} from '@/types/records';

/** Live, filterable ledger data — never statically cache this response. */
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const querySchema = z.object({
  vendor: z.string().trim().min(1).optional(),
  dateFrom: z.string().regex(DATE_PATTERN, 'dateFrom must be in YYYY-MM-DD format.').optional(),
  dateTo: z.string().regex(DATE_PATTERN, 'dateTo must be in YYYY-MM-DD format.').optional(),
  amountMin: z.coerce.number().optional(),
  amountMax: z.coerce.number().optional(),
  status: z.enum(RECORDS_STATUS_FILTERS).default('approved'),
  search: z.string().trim().min(1).optional(),
  sortBy: z.string().trim().min(1).default('-documentDate'),
  page: z.coerce.number().int().min(1).default(1),
});

/** Maps a sortBy field onto its real column, per types/records.ts's RECORDS_SORT_FIELDS. */
const SORT_COLUMNS: Record<RecordsSortField, { column: string; foreignTable?: 'documents' }> = {
  documentDate: { column: 'document_date' },
  vendorName: { column: 'vendor_name' },
  total: { column: 'total_amount' },
  createdAt: { column: 'created_at', foreignTable: 'documents' },
};

/** A leading "-" means descending, e.g. "-documentDate". Returns null for an unrecognized field. */
function parseSortBy(raw: string): { field: RecordsSortField; ascending: boolean } | null {
  const ascending = !raw.startsWith('-');
  const field = (ascending ? raw : raw.slice(1)) as RecordsSortField;
  if (!RECORDS_SORT_FIELDS.includes(field)) return null;
  return { field, ascending };
}

/** Strips characters with structural meaning in PostgREST's or() filter list so free-text search can't break or extend it. */
function sanitizeSearchTerm(value: string): string {
  return value.replace(/[,()]/g, '');
}

/**
 * List endpoint backing the Records screen. Joins documents +
 * document_extractions and defaults to review_status='approved' so a
 * document still awaiting review (or mid-pipeline) never appears here —
 * that's the Review screen's job, not this one's.
 */
export const GET = withApiErrorHandler(async (request: NextRequest) => {
  const raw = Object.fromEntries(
    Array.from(request.nextUrl.searchParams.entries()).filter(([, value]) => value !== '')
  );

  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid query parameters.' },
      { status: 400 }
    );
  }
  const { vendor, dateFrom, dateTo, amountMin, amountMax, status, search, sortBy, page } =
    parsed.data;

  const sort = parseSortBy(sortBy);
  if (!sort) {
    return NextResponse.json(
      {
        error: `sortBy must be one of: ${RECORDS_SORT_FIELDS.join(', ')} (optionally prefixed with "-" for descending).`,
      },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdminClient();

  // Queried from document_extractions (not documents): PostgREST refuses to
  // order a parent table by a one-to-many embedded resource's column
  // (PGRST118 — "do not form a many-to-one or one-to-one relationship").
  // Querying from the "many" side makes vendor/date/amount native top-level
  // columns (trivially sortable/filterable) and documents embeds as the
  // single owning row, which PostgREST *can* order by.
  const sortColumn = SORT_COLUMNS[sort.field];
  const from = (page - 1) * PAGE_SIZE;
  const searchTerm = search ? sanitizeSearchTerm(search) : null;

  let query = supabase
    .from('document_extractions')
    .select(
      `review_status, vendor_name, document_number, document_date, currency,
       subtotal_amount, tax_amount, total_amount, overall_confidence, approved_at,
       documents!inner(id, filename, created_at)`,
      { count: 'exact' }
    )
    .eq('review_status', status);
  if (vendor) query = query.ilike('vendor_name', `%${vendor}%`);
  if (dateFrom) query = query.gte('document_date', dateFrom);
  if (dateTo) query = query.lte('document_date', dateTo);
  if (amountMin !== undefined) query = query.gte('total_amount', amountMin);
  if (amountMax !== undefined) query = query.lte('total_amount', amountMax);
  if (searchTerm) {
    query = query.or(`vendor_name.ilike.%${searchTerm}%,document_number.ilike.%${searchTerm}%`);
  }

  const { data, error, count } = await query
    .order(sortColumn.column, {
      ascending: sort.ascending,
      ...(sortColumn.foreignTable ? { foreignTable: sortColumn.foreignTable } : {}),
    })
    .range(from, from + PAGE_SIZE - 1);

  if (error) {
    // A page past the last one isn't an error — PostgREST rejects the range
    // outright (PGRST103) instead of returning an empty slice, so re-count
    // without a range to report accurate pagination on an empty page.
    if (error.code === 'PGRST103') {
      let countQuery = supabase
        .from('document_extractions')
        .select('id', { count: 'exact', head: true })
        .eq('review_status', status);
      if (vendor) countQuery = countQuery.ilike('vendor_name', `%${vendor}%`);
      if (dateFrom) countQuery = countQuery.gte('document_date', dateFrom);
      if (dateTo) countQuery = countQuery.lte('document_date', dateTo);
      if (amountMin !== undefined) countQuery = countQuery.gte('total_amount', amountMin);
      if (amountMax !== undefined) countQuery = countQuery.lte('total_amount', amountMax);
      if (searchTerm) {
        countQuery = countQuery.or(
          `vendor_name.ilike.%${searchTerm}%,document_number.ilike.%${searchTerm}%`
        );
      }

      const { count: fallbackCount, error: countError } = await countQuery;
      if (countError) {
        return NextResponse.json(
          { error: `Failed to load records: ${countError.message}` },
          { status: 500 }
        );
      }
      const totalCount = fallbackCount ?? 0;
      return NextResponse.json(
        {
          data: [],
          page,
          pageSize: PAGE_SIZE,
          totalCount,
          totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
        } satisfies RecordsResponse,
        { status: 200 }
      );
    }
    return NextResponse.json({ error: `Failed to load records: ${error.message}` }, { status: 500 });
  }

  const items: RecordItem[] = (data ?? []).flatMap((extraction) => {
    const document = extraction.documents;
    if (!document) return [];
    return [
      {
        id: document.id,
        filename: document.filename,
        vendorName: extraction.vendor_name,
        documentNumber: extraction.document_number,
        documentDate: extraction.document_date,
        currency: extraction.currency,
        subtotal: extraction.subtotal_amount,
        tax: extraction.tax_amount,
        total: extraction.total_amount,
        reviewStatus: status,
        overallConfidence: extraction.overall_confidence,
        approvedAt: extraction.approved_at,
        createdAt: document.created_at,
      },
    ];
  });

  const totalCount = count ?? 0;
  const response: RecordsResponse = {
    data: items,
    page,
    pageSize: PAGE_SIZE,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
  };

  return NextResponse.json(response, { status: 200 });
});
