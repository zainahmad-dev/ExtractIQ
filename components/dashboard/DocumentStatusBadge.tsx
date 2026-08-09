import { Badge, type BadgeProps } from '@/components/ui/Badge';
import type { DocumentStatus } from '@/types/status';

const STATUS_LABELS: Record<DocumentStatus, string> = {
  queued: 'Queued',
  processing: 'Processing',
  extracting_text: 'Extracting Text',
  running_ocr: 'Running OCR',
  running_llm: 'Running LLM',
  validating: 'Validating',
  awaiting_review: 'Awaiting Review',
  completed: 'Completed',
  needs_manual_entry: 'Needs Manual Entry',
};

const STATUS_VARIANTS: Record<DocumentStatus, NonNullable<BadgeProps['variant']>> = {
  queued: 'default',
  processing: 'primary',
  extracting_text: 'primary',
  running_ocr: 'primary',
  running_llm: 'primary',
  validating: 'primary',
  awaiting_review: 'warning',
  completed: 'success',
  needs_manual_entry: 'danger',
};

export interface DocumentStatusBadgeProps {
  status: DocumentStatus;
}

export function DocumentStatusBadge({ status }: DocumentStatusBadgeProps) {
  return <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>;
}
