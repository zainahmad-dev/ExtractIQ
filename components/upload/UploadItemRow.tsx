import { FileText, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

export type UploadPhase = 'uploading' | 'queued' | 'error';

export interface UploadItemState {
  clientId: string;
  file: File;
  phase: UploadPhase;
  progress: number;
  documentId?: string;
  errorMessage?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Upload's job ends at showing the initial 'queued' state — granular
 * pipeline status (Extracting Text, Running LLM, ...) is Phase 22's
 * Processing screen, not this component's concern.
 */
export function UploadItemRow({ item }: { item: UploadItemState }) {
  return (
    <div className="flex items-center gap-4 rounded-card border border-surface-elevated bg-surface p-4">
      <FileText size={20} className="shrink-0 text-muted-foreground" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.file.name}</p>
        <p className="text-xs text-muted-foreground">{formatFileSize(item.file.size)}</p>

        {item.phase === 'uploading' && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}

        {item.phase === 'error' && (
          <p className="mt-1 flex items-center gap-1 text-xs text-danger">
            <AlertTriangle size={12} />
            {item.errorMessage}
          </p>
        )}
      </div>

      <div className="shrink-0">
        {item.phase === 'uploading' && (
          <span className="text-xs tabular-nums text-muted-foreground">{item.progress}%</span>
        )}
        {item.phase === 'queued' && <Badge variant="default">Queued</Badge>}
        {item.phase === 'error' && <Badge variant="danger">Failed</Badge>}
      </div>
    </div>
  );
}
