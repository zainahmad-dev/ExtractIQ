/** Shared value formatting for the Analytics screen's charts and metric tiles. */

/** Mirrors RecordsTable's currency handling: fall back to a plain fixed decimal if the extracted code isn't a valid ISO currency. */
export function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

/** Compact form for axis ticks and on-mark labels, where a full "$12,480.00" would collide with its neighbours. */
export function formatCompactCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      notation: 'compact',
      // Without an explicit minimum, compact notation renders a bare 0 as "0.0".
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return value.toFixed(0);
  }
}

/** YYYY-MM is a bare calendar month — read it in UTC so it can't roll back to the previous month. */
function toMonthDate(month: string): Date {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1));
}

/** Short axis form, e.g. "Jan". The window is capped at 12 months, so a bare month name is never ambiguous. */
export function formatMonthLabel(month: string): string {
  return toMonthDate(month).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
}

/** Full form for hover text, e.g. "January 2026". */
export function formatMonthTitle(month: string): string {
  return toMonthDate(month).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

export function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null) return '—';
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;

  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;

  const wholeMinutes = Math.floor(seconds / 60);
  return `${wholeMinutes}m ${Math.round(seconds - wholeMinutes * 60)}s`;
}
