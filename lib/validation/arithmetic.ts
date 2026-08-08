import type { ExtractedDocument } from '@/types/document';

/** Two floating-point amounts within this many currency units are treated as equal. */
const TOLERANCE = 0.01;

export interface ArithmeticCheckResult {
  check: string;
  /** False whenever the document doesn't carry enough data to run the check at all. */
  applicable: boolean;
  passed: boolean;
  expected: number | null;
  actual: number | null;
}

function isClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCE;
}

function inapplicable(check: string, expected: number | null): ArithmeticCheckResult {
  return { check, applicable: false, passed: false, expected, actual: null };
}

/**
 * Sums line-item amounts and compares against the document's stated subtotal.
 * Not applicable when there's no subtotal to compare against, or when no line
 * item carries an amount at all (an empty lineItems array is still a real,
 * comparable claim of "zero items").
 */
export function checkLineItemsSumMatchesSubtotal(document: ExtractedDocument): ArithmeticCheckResult {
  const check = 'line_items_sum_matches_subtotal';

  if (document.subtotal === null) {
    return inapplicable(check, null);
  }

  const amounts = document.lineItems
    .map((item) => item.amount)
    .filter((amount): amount is number => amount !== null);

  if (document.lineItems.length > 0 && amounts.length === 0) {
    return inapplicable(check, document.subtotal);
  }

  const actual = amounts.reduce((sum, amount) => sum + amount, 0);
  return { check, applicable: true, passed: isClose(actual, document.subtotal), expected: document.subtotal, actual };
}

/**
 * Compares subtotal + tax against the document's stated total.
 */
export function checkSubtotalPlusTaxMatchesTotal(document: ExtractedDocument): ArithmeticCheckResult {
  const check = 'subtotal_plus_tax_matches_total';

  if (document.subtotal === null || document.tax === null || document.total === null) {
    return inapplicable(check, document.total);
  }

  const actual = document.subtotal + document.tax;
  return { check, applicable: true, passed: isClose(actual, document.total), expected: document.total, actual };
}

/** Runs every arithmetic sanity check for a structured document. */
export function runArithmeticChecks(document: ExtractedDocument): ArithmeticCheckResult[] {
  return [checkLineItemsSumMatchesSubtotal(document), checkSubtotalPlusTaxMatchesTotal(document)];
}
