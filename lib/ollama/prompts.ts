/**
 * Pure string-building only — no HTTP or database calls belong in this file.
 * Phase 10's structuring chain and Phase 11's retry wrapper both consume
 * these functions directly rather than duplicating prompt text inline.
 *
 * The exact JSON shape is enforced separately via Ollama's structured-output
 * `format` parameter (see lib/ollama/schemas.ts) rather than restated here as
 * prose. Empirically, against a small local model, describing the schema a
 * second time in the prompt text competed with the actual document for the
 * model's attention and produced all-null output even on a document with
 * every field present; dropping the redundant description and placing the
 * document text before the instruction (closest to where generation begins)
 * fixed it.
 */

const EXTRACTION_RULES = `Use null for any field you cannot determine with confidence. Do not guess.
"lineItems" must always be an array — use an empty array if none are present.
Numbers must be plain numbers, with no currency symbols or thousands separators.`;

/**
 * Builds the initial extraction prompt for a raw invoice/receipt text body.
 */
export function buildExtractionPrompt(rawText: string): string {
  return `Document text:
"""
${rawText}
"""

Extract the vendor name, document number, document date, currency, subtotal, tax, total, and line items from the document above.
${EXTRACTION_RULES}`;
}

/**
 * Builds a follow-up prompt after the model's previous output failed schema
 * validation, pointing it at the specific errors so it can self-correct.
 */
export function buildRetryPrompt(
  rawText: string,
  previousOutput: string,
  validationErrors: string
): string {
  return `Document text:
"""
${rawText}
"""

Your previous extraction attempt was:
${previousOutput}

It failed validation with these errors:
${validationErrors}

Extract the vendor name, document number, document date, currency, subtotal, tax, total, and line items from the document above, correcting the errors listed.
${EXTRACTION_RULES}`;
}
