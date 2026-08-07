import { z } from 'zod';

/**
 * Single source of truth for the shape an LLM extraction must produce.
 * Field names are camelCase here (the LLM/JSON layer); Phase 12's orchestrator
 * maps them onto document_extractions' snake_case columns (vendor_name,
 * document_date, subtotal_amount, ...) defined in supabase/migrations/0001_init.sql.
 */
export const lineItemSchema = z.object({
  description: z.string().nullable(),
  quantity: z.number().nullable(),
  unitPrice: z.number().nullable(),
  amount: z.number().nullable(),
});

export const extractedDocumentSchema = z.object({
  vendorName: z.string().nullable(),
  documentNumber: z.string().nullable(),
  documentDate: z.string().nullable(),
  currency: z.string().nullable(),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  total: z.number().nullable(),
  lineItems: z.array(lineItemSchema),
});

export type LineItem = z.infer<typeof lineItemSchema>;
export type ExtractedDocument = z.infer<typeof extractedDocumentSchema>;
