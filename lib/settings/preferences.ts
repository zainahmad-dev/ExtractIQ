import { isExportFormat, type ExportFormat } from '@/types/export';

/**
 * Workspace-wide settings, backed by the app_settings singleton row
 * (supabase/migrations/0002_settings.sql) and read/written through
 * GET/PATCH /api/settings.
 *
 * Deliberately *not* per-browser: this app has no per-user auth, and the
 * confidence threshold decides which fields Review flags, so two reviewers on
 * different machines looking at the same document must see the same flags.
 * Nothing here is persisted client-side.
 *
 * The bottom half of this file is the client-side store behind
 * hooks/usePreferences.ts. It is browser-only (it calls fetch with a relative
 * URL); the API route imports only the shape and validation helpers above it.
 */

export const CONFIDENCE_THRESHOLD_MIN = 0;
export const CONFIDENCE_THRESHOLD_MAX = 100;

/**
 * Phase 2 fixed ConfidenceBadge's red band at "< 85". Defaulting to the same
 * boundary means an untouched install flags exactly what it flagged before
 * this setting existed. Kept in sync with app_settings.confidence_threshold's
 * column default.
 */
export const DEFAULT_CONFIDENCE_THRESHOLD = 85;

export interface Preferences {
  /** Field confidence below this (0-100) is flagged for attention on the Review screen. */
  confidenceThreshold: number;
  /** Which format the Export screen pre-selects. */
  defaultExportFormat: ExportFormat;
}

export const DEFAULT_PREFERENCES: Preferences = {
  confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
  defaultExportFormat: 'csv',
};

export function clampConfidenceThreshold(value: unknown): number {
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (typeof numeric !== 'number' || !Number.isFinite(numeric)) {
    return DEFAULT_CONFIDENCE_THRESHOLD;
  }
  return Math.min(CONFIDENCE_THRESHOLD_MAX, Math.max(CONFIDENCE_THRESHOLD_MIN, Math.round(numeric)));
}

/** Normalizes an API response (or any partial value) into a complete, valid Preferences object. */
export function normalizePreferences(value: Partial<Preferences> | null | undefined): Preferences {
  return {
    confidenceThreshold: clampConfidenceThreshold(value?.confidenceThreshold),
    defaultExportFormat: isExportFormat(value?.defaultExportFormat)
      ? value.defaultExportFormat
      : DEFAULT_PREFERENCES.defaultExportFormat,
  };
}

// --- Client-side store (browser only) ----------------------------------------

const SETTINGS_ENDPOINT = '/api/settings';

export interface PreferencesSnapshot {
  preferences: Preferences;
  /** True until the first load settles — consumers render the defaults meanwhile. */
  loading: boolean;
  /** Set when the settings couldn't be read; the last known values stay in place. */
  error: string | null;
}

/**
 * useSyncExternalStore needs a stable reference for the server snapshot, and
 * the client starts from the same object so hydration can't mismatch.
 */
const INITIAL_SNAPSHOT: PreferencesSnapshot = {
  preferences: DEFAULT_PREFERENCES,
  loading: true,
  error: null,
};

let snapshot: PreferencesSnapshot = INITIAL_SNAPSHOT;
let inFlightLoad: Promise<void> | null = null;
let hasLoaded = false;

const listeners = new Set<() => void>();

function publish(next: PreferencesSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function readPreferencesSnapshot(): PreferencesSnapshot {
  return snapshot;
}

export function getServerPreferencesSnapshot(): PreferencesSnapshot {
  return INITIAL_SNAPSHOT;
}

/**
 * Fetches the shared settings. Concurrent callers share one request, and the
 * result is cached for the page's lifetime unless `force` asks for a refresh.
 * A failure keeps the last known values and surfaces the message rather than
 * throwing — Review must stay usable on some threshold even if this is down.
 */
export async function loadPreferences(force = false): Promise<void> {
  if (typeof window === 'undefined') return;
  if (inFlightLoad) return inFlightLoad;
  if (hasLoaded && !force) return;

  inFlightLoad = (async () => {
    try {
      const response = await fetch(SETTINGS_ENDPOINT);
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error ?? `Failed to load settings (status ${response.status}).`);
      }
      hasLoaded = true;
      publish({ preferences: normalizePreferences(body), loading: false, error: null });
    } catch (error) {
      publish({
        preferences: snapshot.preferences,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load settings.',
      });
    } finally {
      inFlightLoad = null;
    }
  })();

  return inFlightLoad;
}

/**
 * Writes a partial update through PATCH /api/settings and republishes what the
 * server stored, so every consumer in this tab updates immediately. Throws on
 * failure so the caller can report it — unlike a load, a silent failed save
 * would leave the user believing a workspace policy changed when it hadn't.
 */
export async function savePreferences(update: Partial<Preferences>): Promise<Preferences> {
  const response = await fetch(SETTINGS_ENDPOINT, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error ?? `Failed to save settings (status ${response.status}).`);
  }

  const preferences = normalizePreferences(body);
  hasLoaded = true;
  publish({ preferences, loading: false, error: null });
  return preferences;
}

export function subscribeToPreferences(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  listeners.add(onChange);
  // The first consumer to mount triggers the load; the rest reuse the snapshot.
  void loadPreferences();

  // These are shared settings, so another reviewer can change them while this
  // tab sits idle — revalidate whenever the tab comes back to the foreground
  // rather than letting a stale policy linger for the length of a session.
  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') void loadPreferences(true);
  }
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    listeners.delete(onChange);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
