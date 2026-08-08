import type { ArithmeticCheckResult } from '@/lib/validation/arithmetic';

/** A field's confidence is capped to at most this when an arithmetic check implicating it fails. */
const ARITHMETIC_FAIL_CAP = 40;

/** overall_confidence is forced below this when the document failed schema validation. */
const SCHEMA_INVALID_CEILING = 20;

/**
 * Which document_extractions field(s) a failed arithmetic check (by its
 * `check` name from lib/validation/arithmetic.ts) casts doubt on.
 */
const ARITHMETIC_CHECK_FIELDS: Record<string, string[]> = {
  line_items_sum_matches_subtotal: ['line_items', 'subtotal_amount'],
  subtotal_plus_tax_matches_total: ['subtotal_amount', 'tax_amount', 'total_amount'],
};

export interface ScoreInput {
  /** Phase 15's raw per-field presence signal (0 or 100), keyed by document_extractions column name. */
  fieldConfidence: Record<string, number>;
  /** Phase 15's ocr_quality_score (0-100), or null if not applicable. */
  ocrQualityScore: number | null;
  /** Phase 15's schema_valid flag. */
  schemaValid: boolean;
  /** Phase 14's arithmetic sanity check results. */
  arithmeticChecks: ArithmeticCheckResult[];
}

export interface ScoreResult {
  /** Combined per-field confidence (0-100), same keys as the input. */
  fieldConfidence: Record<string, number>;
  /** Minimum across all fields, not an average — the weakest field sets the document's trust level. */
  overallConfidence: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function fieldsImplicatedByFailedChecks(arithmeticChecks: ArithmeticCheckResult[]): Set<string> {
  const implicated = new Set<string>();
  for (const result of arithmeticChecks) {
    if (!result.applicable || result.passed) continue;
    for (const field of ARITHMETIC_CHECK_FIELDS[result.check] ?? []) {
      implicated.add(field);
    }
  }
  return implicated;
}

/**
 * Combines Phase 15's raw per-field signal with Phase 14's arithmetic checks
 * into one confidence per field, then reduces those to a single document
 * score. Per field, in order: start at the raw (LLM/presence) confidence,
 * discount it by OCR quality, cap it low if an arithmetic check involving it
 * failed, then force it to zero if the field was missing in the first place.
 */
export function score(input: ScoreInput): ScoreResult {
  const implicatedFields = fieldsImplicatedByFailedChecks(input.arithmeticChecks);
  const ocrFactor = input.ocrQualityScore === null ? 1 : input.ocrQualityScore / 100;

  const fieldConfidence: Record<string, number> = {};

  for (const [field, baseConfidence] of Object.entries(input.fieldConfidence)) {
    let confidence = baseConfidence * ocrFactor;

    if (implicatedFields.has(field)) {
      confidence = Math.min(confidence, ARITHMETIC_FAIL_CAP);
    }

    if (baseConfidence === 0) {
      confidence = 0;
    }

    fieldConfidence[field] = round2(confidence);
  }

  const values = Object.values(fieldConfidence);
  let overallConfidence = values.length > 0 ? Math.min(...values) : 0;

  if (!input.schemaValid) {
    overallConfidence = Math.min(overallConfidence, SCHEMA_INVALID_CEILING);
  }

  return { fieldConfidence, overallConfidence: round2(overallConfidence) };
}
