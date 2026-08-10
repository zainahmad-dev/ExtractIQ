'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { usePreferencesSnapshot } from '@/hooks/usePreferences';
import {
  CONFIDENCE_THRESHOLD_MAX,
  CONFIDENCE_THRESHOLD_MIN,
  DEFAULT_PREFERENCES,
  clampConfidenceThreshold,
  savePreferences,
} from '@/lib/settings/preferences';
import { EXPORT_FORMATS, isExportFormat } from '@/types/export';

export default function SettingsPage() {
  const { preferences, loading, error: loadError } = usePreferencesSnapshot();

  // Held as a string so the number field can be cleared mid-edit without the
  // value snapping back; it's clamped to a valid number on save.
  const [thresholdInput, setThresholdInput] = useState(String(preferences.confidenceThreshold));
  const [format, setFormat] = useState(preferences.defaultExportFormat);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Re-syncs once the stored settings arrive, and again whenever a refresh
  // brings in a change someone else made.
  useEffect(() => {
    setThresholdInput(String(preferences.confidenceThreshold));
    setFormat(preferences.defaultExportFormat);
  }, [preferences]);

  async function persist(confidenceThreshold: number, defaultExportFormat: typeof format) {
    setSaving(true);
    setSaveError(null);
    try {
      await savePreferences({ confidenceThreshold, defaultExportFormat });
      setSavedAt(Date.now());
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  function save() {
    const confidenceThreshold = clampConfidenceThreshold(thresholdInput);
    setThresholdInput(String(confidenceThreshold));
    void persist(confidenceThreshold, format);
  }

  function resetToDefaults() {
    void persist(DEFAULT_PREFERENCES.confidenceThreshold, DEFAULT_PREFERENCES.defaultExportFormat);
  }

  const isDirty =
    clampConfidenceThreshold(thresholdInput) !== preferences.confidenceThreshold ||
    format !== preferences.defaultExportFormat;
  const busy = loading || saving;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          These apply to everyone using this workspace — there are no per-user settings.
        </p>
      </div>

      {loadError && (
        <Card className="max-w-2xl border border-danger/40 bg-danger/5">
          <p className="text-sm text-danger">{loadError}</p>
        </Card>
      )}

      {saveError && (
        <Card className="max-w-2xl border border-danger/40 bg-danger/5">
          <p className="text-sm text-danger">{saveError}</p>
        </Card>
      )}

      <Card className="flex max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="confidenceThreshold" className="text-sm font-medium">
            Confidence threshold
          </label>
          <p className="text-xs text-muted-foreground">
            Extracted fields scoring below this are flagged for attention on the Review screen.
            Raising it flags more fields; lowering it flags fewer.
          </p>
          {/* Width lives on the wrapper: utils/cn.ts concatenates rather than
              merging, so Input's own w-full would win over a w-* passed in. */}
          <div className="flex items-center gap-2">
            <div className="w-28">
              <Input
                id="confidenceThreshold"
                type="number"
                min={CONFIDENCE_THRESHOLD_MIN}
                max={CONFIDENCE_THRESHOLD_MAX}
                step={1}
                value={thresholdInput}
                onChange={(event) => setThresholdInput(event.target.value)}
                disabled={busy}
              />
            </div>
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="defaultExportFormat" className="text-sm font-medium">
            Default export format
          </label>
          <p className="text-xs text-muted-foreground">
            Pre-selected on the Export screen. You can still change it per export.
          </p>
          <div className="w-40">
            <Select
              id="defaultExportFormat"
              value={format}
              onChange={(event) => {
                if (isExportFormat(event.target.value)) setFormat(event.target.value);
              }}
              disabled={busy}
            >
              {EXPORT_FORMATS.map((option) => (
                <option key={option} value={option}>
                  {option.toUpperCase()}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-surface-elevated pt-4">
          <Button type="button" variant="primary" onClick={save} disabled={busy || !isDirty}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="outline" onClick={resetToDefaults} disabled={busy}>
            Reset to defaults
          </Button>
          {loading && <span className="text-xs text-muted-foreground">Loading settings…</span>}
          {savedAt !== null && !saving && !isDirty && !saveError && (
            <span className="text-xs text-success">Saved</span>
          )}
        </div>
      </Card>
    </div>
  );
}
