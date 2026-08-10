import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiErrorHandler } from '@/lib/api-error-handler';
import { getSupabaseAdminClient } from '@/lib/storage/supabase';
import {
  CONFIDENCE_THRESHOLD_MAX,
  CONFIDENCE_THRESHOLD_MIN,
  DEFAULT_PREFERENCES,
  type Preferences,
} from '@/lib/settings/preferences';
import { EXPORT_FORMATS, isExportFormat } from '@/types/export';

/** Shared workspace policy — never statically cache this response. */
export const dynamic = 'force-dynamic';

/** app_settings is a singleton keyed on a boolean CHECK-constrained to true. */
const SETTINGS_ROW_ID = true;

const SETTINGS_COLUMNS = 'confidence_threshold, default_export_format';

const patchSchema = z
  .object({
    confidenceThreshold: z
      .number()
      .int('confidenceThreshold must be a whole number.')
      .min(CONFIDENCE_THRESHOLD_MIN, `confidenceThreshold must be at least ${CONFIDENCE_THRESHOLD_MIN}.`)
      .max(CONFIDENCE_THRESHOLD_MAX, `confidenceThreshold must be at most ${CONFIDENCE_THRESHOLD_MAX}.`)
      .optional(),
    defaultExportFormat: z
      .enum(EXPORT_FORMATS, { message: `defaultExportFormat must be one of: ${EXPORT_FORMATS.join(', ')}.` })
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one setting to update.',
  });

interface SettingsRow {
  confidence_threshold: number;
  default_export_format: string;
}

/** Maps the row's snake_case columns onto the camelCase shape the app uses. */
function toPreferences(row: SettingsRow): Preferences {
  return {
    confidenceThreshold: row.confidence_threshold,
    defaultExportFormat: isExportFormat(row.default_export_format)
      ? row.default_export_format
      : DEFAULT_PREFERENCES.defaultExportFormat,
  };
}

export const GET = withApiErrorHandler(async () => {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('app_settings')
    .select(SETTINGS_COLUMNS)
    .eq('id', SETTINGS_ROW_ID)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Failed to load settings: ${error.message}` },
      { status: 500 }
    );
  }

  // The migration seeds the row; this only covers a table that was truncated.
  return NextResponse.json(data ? toPreferences(data) : DEFAULT_PREFERENCES, { status: 200 });
});

export const PATCH = withApiErrorHandler(async (request: NextRequest) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid settings payload.' },
      { status: 400 }
    );
  }

  const { confidenceThreshold, defaultExportFormat } = parsed.data;
  const supabase = getSupabaseAdminClient();

  // Upsert rather than update so the singleton is recreated if it ever went
  // missing; unspecified columns keep their stored values.
  const { data, error } = await supabase
    .from('app_settings')
    .upsert(
      {
        id: SETTINGS_ROW_ID,
        ...(confidenceThreshold !== undefined ? { confidence_threshold: confidenceThreshold } : {}),
        ...(defaultExportFormat !== undefined
          ? { default_export_format: defaultExportFormat }
          : {}),
      },
      { onConflict: 'id' }
    )
    .select(SETTINGS_COLUMNS)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: `Failed to save settings: ${error?.message ?? 'no row returned'}` },
      { status: 500 }
    );
  }

  return NextResponse.json(toPreferences(data), { status: 200 });
});
