import { zodToJsonSchema } from 'zod-to-json-schema';
import { extractedDocumentSchema, type ExtractedDocument } from '@/types/document';

/**
 * Wraps types/document.ts's Zod schema for Ollama's structured-output mode —
 * does not redefine any fields, just re-projects the same schema for two
 * different consumers (JSON Schema for the model, safeParse for the response).
 */

/** JSON Schema suitable for Ollama's `format` request field (constrained decoding). */
export const extractedDocumentJsonSchema = zodToJsonSchema(extractedDocumentSchema);

export type SchemaValidationResult =
  { success: true; data: ExtractedDocument } | { success: false; errors: string };

/** Validates a parsed JSON value against the canonical extraction schema. */
export function validateExtractedDocument(value: unknown): SchemaValidationResult {
  const result = extractedDocumentSchema.safeParse(value);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');

  return { success: false, errors };
}
