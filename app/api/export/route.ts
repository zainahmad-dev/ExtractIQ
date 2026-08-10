import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/storage/supabase';
import { toCsv } from '@/lib/export/csv';
import { toJson } from '@/lib/export/json';
import { EXPORT_FORMATS, type ExportFilters, type ExportRecord } from '@/types/export';

/** Live ledger data — never statically cache this response. */
export const dynamic = 'force-dynamic';

/** PostgREST caps a single response at 1000 rows, so the result set is read in pages — an export must never be silently truncated. */
const FETCH_PAGE_SIZE = 1000;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const querySchema = z.object({
  format: z.enum(EXPORT_FORMATS, {
    message: `format must be one of: ${EXPORT_FORMATS.join(', ')}.`,
  }),
  vendor: z.string().trim().min(1).optional(),
  dateFrom: z.string().regex(DATE_PATTERN, 'dateFrom must be in YYYY-MM-DD format.').optional(),
  dateTo: z.string().regex(DATE_PATTERN, 'dateTo must be in YYYY-MM-DD format.').optional(),
  amountMin: z.coerce.number().optional(),
  amountMax: z.coerce.number().optional(),
  search: z.string().trim().min(1).optional(),
});

/** Mirrors Phase 24's sanitizer: strips the characters PostgREST's or() list treats as structure. */
function sanitizeSearchTerm(value: string): string {
  return value.replace(/[,()]/g, '');
}

const CONTENT_TYPES = {
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
} as const;

export async function GET(request: NextRequest) {
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

  const { format, vendor, dateFrom, dateTo, amountMin, amountMax, search } = parsed.data;

  // Only the filters actually applied are recorded on the exports row, so the
  // history says what was exported rather than listing empty fields.
  const filters: ExportFilters = {
    ...(vendor ? { vendor } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(amountMin !== undefined ? { amountMin } : {}),
    ...(amountMax !== undefined ? { amountMax } : {}),
    ...(search ? { search } : {}),
  };

  const supabase = getSupabaseAdminClient();
  const searchTerm = search ? sanitizeSearchTerm(search) : null;

  // Queried from document_extractions with documents embedded, the same way
  // Phase 24's Records endpoint does — vendor/date/amount are native columns
  // on this side of the join, so they filter and sort directly.
  const records: ExportRecord[] = [];

  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    let query = supabase
      .from('document_extractions')
      .select(
        `vendor_name, document_number, document_date, currency,
         subtotal_amount, tax_amount, total_amount, overall_confidence, approved_at,
         documents!inner(id, filename)`
      )
      .eq('review_status', 'approved');

    if (vendor) query = query.ilike('vendor_name', `%${vendor}%`);
    if (dateFrom) query = query.gte('document_date', dateFrom);
    if (dateTo) query = query.lte('document_date', dateTo);
    if (amountMin !== undefined) query = query.gte('total_amount', amountMin);
    if (amountMax !== undefined) query = query.lte('total_amount', amountMax);
    if (searchTerm) {
      query = query.or(`vendor_name.ilike.%${searchTerm}%,document_number.ilike.%${searchTerm}%`);
    }

    const { data, error } = await query
      .order('document_date', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1);

    if (error) {
      return NextResponse.json(
        { error: `Failed to load records for export: ${error.message}` },
        { status: 500 }
      );
    }

    const page = data ?? [];
    for (const extraction of page) {
      const document = extraction.documents;
      if (!document) continue;
      records.push({
        documentId: document.id,
        filename: document.filename,
        vendorName: extraction.vendor_name,
        documentNumber: extraction.document_number,
        documentDate: extraction.document_date,
        currency: extraction.currency,
        subtotal: extraction.subtotal_amount,
        tax: extraction.tax_amount,
        total: extraction.total_amount,
        overallConfidence: extraction.overall_confidence,
        approvedAt: extraction.approved_at,
      });
    }

    if (page.length < FETCH_PAGE_SIZE) break;
  }

  const body = format === 'csv' ? toCsv(records) : toJson(records);

  // History is written before the file goes out, but a failed insert only
  // logs — the same rule Phase 13's logStep follows, so a broken audit write
  // never costs the user the data they asked for.
  const { error: historyError } = await supabase.from('exports').insert({
    format,
    filters,
    record_count: records.length,
  });
  if (historyError) {
    console.error(`Failed to record export history (${format}):`, historyError.message);
  }

  const filename = `extractiq-export-${new Date().toISOString().slice(0, 10)}.${format}`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': CONTENT_TYPES[format],
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Export-Record-Count': String(records.length),
    },
  });
}
