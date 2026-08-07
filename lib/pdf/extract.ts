import { PDFParse } from 'pdf-parse';

const OCR_QUALITY_THRESHOLD = 40;
const TARGET_CHARS_PER_PAGE = 200;

/**
 * A small, dependency-free set of common English function words plus
 * invoice/receipt domain vocabulary, used to score how much of the
 * extracted text looks like real language versus noise/gibberish.
 */
const COMMON_WORDS = new Set([
  'the',
  'and',
  'of',
  'to',
  'a',
  'in',
  'is',
  'for',
  'on',
  'that',
  'this',
  'with',
  'as',
  'by',
  'at',
  'from',
  'be',
  'are',
  'was',
  'were',
  'or',
  'an',
  'it',
  'if',
  'not',
  'no',
  'yes',
  'you',
  'your',
  'we',
  'our',
  'they',
  'their',
  'has',
  'have',
  'had',
  'will',
  'can',
  'per',
  'each',
  'all',
  'any',
  'please',
  'thank',
  'thanks',
  'below',
  'above',
  'may',
  'must',
  'other',
  'total',
  'invoice',
  'receipt',
  'subtotal',
  'tax',
  'amount',
  'date',
  'due',
  'payment',
  'paid',
  'balance',
  'customer',
  'vendor',
  'item',
  'items',
  'quantity',
  'qty',
  'price',
  'unit',
  'description',
  'number',
  'order',
  'bill',
  'billing',
  'shipping',
  'address',
  'name',
  'company',
  'account',
  'terms',
  'net',
  'discount',
  'charge',
  'fee',
  'service',
  'services',
  'product',
  'products',
  'summary',
  'reference',
  'contact',
  'email',
  'phone',
  'city',
  'state',
  'zip',
  'country',
  'method',
  'card',
  'cash',
  'check',
  'issued',
  'delivery',
  'notes',
]);

export interface PdfExtractionResult {
  text: string;
  pageCount: number;
  charsPerPage: number;
  alphanumericRatio: number;
  recognizableWordRatio: number;
  qualityScore: number;
  requiresOcr: boolean;
}

function scoreText(text: string, pageCount: number) {
  const nonWhitespace = text.replace(/\s/g, '');
  const alphanumericCount = (text.match(/[a-zA-Z0-9]/g) ?? []).length;
  const alphanumericRatio = nonWhitespace.length > 0 ? alphanumericCount / nonWhitespace.length : 0;

  const words = text.toLowerCase().match(/[a-z]{2,}/g) ?? [];
  const recognizedCount = words.filter((word) => COMMON_WORDS.has(word)).length;
  const recognizableWordRatio = words.length > 0 ? recognizedCount / words.length : 0;

  const charsPerPage = pageCount > 0 ? nonWhitespace.length / pageCount : 0;
  const charsPerPageScore = Math.min(charsPerPage / TARGET_CHARS_PER_PAGE, 1) * 100;

  const qualityScore =
    charsPerPageScore * 0.4 + alphanumericRatio * 100 * 0.3 + recognizableWordRatio * 100 * 0.3;

  return { charsPerPage, alphanumericRatio, recognizableWordRatio, qualityScore };
}

/**
 * Extracts text from a digital PDF and scores its quality to decide whether
 * the document instead needs OCR (Phase 8). Does not attempt OCR itself.
 */
export async function extractPdfText(buffer: Buffer): Promise<PdfExtractionResult> {
  const parser = new PDFParse({ data: buffer });

  try {
    // pdf-parse defaults to appending a "-- page N of M --" marker after each
    // page's text. That's boilerplate, not extracted content, and would
    // corrupt the quality scoring below (e.g. a blank scanned page would
    // still show up as a dozen "real" characters), so it's disabled here.
    const result = await parser.getText({ pageJoiner: '' });
    const text = result.text.trim();
    const pageCount = result.total || result.pages.length || 1;

    const { charsPerPage, alphanumericRatio, recognizableWordRatio, qualityScore } = scoreText(
      text,
      pageCount
    );

    return {
      text,
      pageCount,
      charsPerPage,
      alphanumericRatio,
      recognizableWordRatio,
      qualityScore,
      requiresOcr: qualityScore < OCR_QUALITY_THRESHOLD,
    };
  } finally {
    await parser.destroy();
  }
}
