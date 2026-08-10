'use client';

import { useSyncExternalStore } from 'react';
import {
  getServerPreferencesSnapshot,
  readPreferencesSnapshot,
  subscribeToPreferences,
  type Preferences,
  type PreferencesSnapshot,
} from '@/lib/settings/preferences';

/**
 * Subscribes to the workspace-wide settings held in the app_settings table.
 * The store fetches them once per page load (and again when the tab regains
 * focus, since another reviewer may have changed them), so every consumer in
 * the tab re-renders the moment a new value arrives.
 *
 * Until the first load settles, and if it fails, consumers see
 * DEFAULT_PREFERENCES — the same values the table itself defaults to.
 */
export function usePreferencesSnapshot(): PreferencesSnapshot {
  return useSyncExternalStore(
    subscribeToPreferences,
    readPreferencesSnapshot,
    getServerPreferencesSnapshot
  );
}

/** The values alone, for consumers that don't need to report load state (Review, Export). */
export function usePreferences(): Preferences {
  return usePreferencesSnapshot().preferences;
}
