'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';
import { extractedDocumentSchema, type ExtractedDocument } from '@/types/document';
import { cn } from '@/utils/cn';

export interface ReviewDraftLineItem {
  id: string;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
}

export interface ReviewDraft {
  id: string;
  review_status: string;
  vendor_name: string | null;
  document_number: string | null;
  document_date: string | null;
  currency: string | null;
  subtotal_amount: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  field_confidence: Record<string, number> | null;
  lineItems: ReviewDraftLineItem[];
}

export interface ReviewFormProps {
  documentId: string;
  draft: ReviewDraft;
}

/** Same thresholds as components/ui/ConfidenceBadge.tsx, reused here to color the inputs themselves, not just the adjacent badge. */
function confidenceBorderClass(score: number | null | undefined): string {
  if (score === null || score === undefined) return '';
  if (score >= 95) return 'border-success/50 focus-visible:ring-success';
  if (score >= 85) return 'border-warning/50 focus-visible:ring-warning';
  return 'border-danger/50 focus-visible:ring-danger';
}

function toFormValues(draft: ReviewDraft): ExtractedDocument {
  return {
    vendorName: draft.vendor_name,
    documentNumber: draft.document_number,
    documentDate: draft.document_date,
    currency: draft.currency,
    subtotal: draft.subtotal_amount,
    tax: draft.tax_amount,
    total: draft.total_amount,
    lineItems: draft.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      amount: item.amount,
    })),
  };
}

type ActionState = 'idle' | 'saving' | 'approving' | 'rejecting';

interface FieldConfig {
  name: 'vendorName' | 'documentNumber' | 'documentDate' | 'currency';
  label: string;
  confidenceKey: string;
}

const TEXT_FIELDS: FieldConfig[] = [
  { name: 'vendorName', label: 'Vendor', confidenceKey: 'vendor_name' },
  { name: 'documentNumber', label: 'Document Number', confidenceKey: 'document_number' },
  { name: 'documentDate', label: 'Document Date', confidenceKey: 'document_date' },
  { name: 'currency', label: 'Currency', confidenceKey: 'currency' },
];

interface NumberFieldConfig {
  name: 'subtotal' | 'tax' | 'total';
  label: string;
  confidenceKey: string;
}

const NUMBER_FIELDS: NumberFieldConfig[] = [
  { name: 'subtotal', label: 'Subtotal', confidenceKey: 'subtotal_amount' },
  { name: 'tax', label: 'Tax', confidenceKey: 'tax_amount' },
  { name: 'total', label: 'Total', confidenceKey: 'total_amount' },
];

export function ReviewForm({ documentId, draft }: ReviewFormProps) {
  const router = useRouter();
  const [actionState, setActionState] = useState<ActionState>('idle');
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const isDecided = draft.review_status !== 'pending_review';
  const fieldConfidence = draft.field_confidence ?? {};

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ExtractedDocument>({
    resolver: zodResolver(extractedDocumentSchema) as Resolver<ExtractedDocument>,
    defaultValues: toFormValues(draft),
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lineItems' });

  async function submitTo(endpoint: string, body?: ExtractedDocument) {
    const response = await fetch(endpoint, {
      method: 'POST',
      ...(body
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
        : {}),
    });
    const responseBody = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(responseBody?.error ?? `Request failed with status ${response.status}.`);
    }
    return responseBody;
  }

  const onSave = handleSubmit(async (values) => {
    setActionState('saving');
    setActionError(null);
    try {
      const response = await fetch(`/api/documents/${documentId}/draft`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error ?? `Failed to save (status ${response.status}).`);
      }
      setSavedAt(Date.now());
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to save changes.');
    } finally {
      setActionState('idle');
    }
  });

  const onApprove = handleSubmit(async (values) => {
    setActionState('approving');
    setActionError(null);
    try {
      await submitTo(`/api/documents/${documentId}/approve`, values);
      router.push('/records');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to approve.');
      setActionState('idle');
    }
  });

  async function onReject() {
    if (!window.confirm('Reject this document? This cannot be undone.')) return;
    setActionState('rejecting');
    setActionError(null);
    try {
      await submitTo(`/api/documents/${documentId}/reject`);
      router.push('/records');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to reject.');
      setActionState('idle');
    }
  }

  const busy = actionState !== 'idle';

  return (
    <Card className="flex h-full flex-col gap-6 overflow-y-auto">
      {isDecided && (
        <div className="rounded-control border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          This document has already been {draft.review_status}. Values can no longer be edited.
        </div>
      )}

      {actionError && (
        <div className="rounded-control border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {actionError}
        </div>
      )}

      <form onSubmit={(event) => event.preventDefault()} className="flex flex-1 flex-col gap-6">
        <fieldset disabled={isDecided || busy} className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {TEXT_FIELDS.map((field) => (
              <div key={field.name} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={field.name} className="text-sm font-medium text-muted-foreground">
                    {field.label}
                  </label>
                  {field.confidenceKey in fieldConfidence && (
                    <ConfidenceBadge score={fieldConfidence[field.confidenceKey]} />
                  )}
                </div>
                <Input
                  id={field.name}
                  {...register(field.name)}
                  className={confidenceBorderClass(fieldConfidence[field.confidenceKey])}
                />
                {errors[field.name] && (
                  <p className="text-xs text-danger">{errors[field.name]?.message}</p>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {NUMBER_FIELDS.map((field) => (
              <div key={field.name} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={field.name} className="text-sm font-medium text-muted-foreground">
                    {field.label}
                  </label>
                  {field.confidenceKey in fieldConfidence && (
                    <ConfidenceBadge score={fieldConfidence[field.confidenceKey]} />
                  )}
                </div>
                <Input
                  id={field.name}
                  type="text"
                  inputMode="decimal"
                  {...register(field.name, {
                    setValueAs: (value) => (value === '' ? null : Number(value)),
                  })}
                  className={confidenceBorderClass(fieldConfidence[field.confidenceKey])}
                />
                {errors[field.name] && (
                  <p className="text-xs text-danger">{errors[field.name]?.message}</p>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Line Items</h2>
              {'line_items' in fieldConfidence && (
                <ConfidenceBadge score={fieldConfidence.line_items} />
              )}
            </div>

            <div className="flex flex-col gap-2">
              {fields.map((item, index) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_5rem_6rem_6rem_2rem] items-center gap-2"
                >
                  <Input
                    placeholder="Description"
                    {...register(`lineItems.${index}.description`)}
                  />
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="Qty"
                    {...register(`lineItems.${index}.quantity`, {
                      setValueAs: (value) => (value === '' ? null : Number(value)),
                    })}
                  />
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="Unit price"
                    {...register(`lineItems.${index}.unitPrice`, {
                      setValueAs: (value) => (value === '' ? null : Number(value)),
                    })}
                  />
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="Amount"
                    {...register(`lineItems.${index}.amount`, {
                      setValueAs: (value) => (value === '' ? null : Number(value)),
                    })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(index)}
                    aria-label="Remove line item"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() =>
                append({ description: null, quantity: null, unitPrice: null, amount: null })
              }
            >
              Add line item
            </Button>
          </div>
        </fieldset>

        <div
          className={cn(
            'flex flex-wrap items-center gap-3 border-t border-surface-elevated pt-4',
            isDecided && 'opacity-50'
          )}
        >
          <Button type="button" variant="outline" onClick={onSave} disabled={isDecided || busy}>
            {actionState === 'saving' ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="primary" onClick={onApprove} disabled={isDecided || busy}>
            {actionState === 'approving' ? 'Approving…' : 'Approve'}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onReject}
            disabled={isDecided || busy}
          >
            {actionState === 'rejecting' ? 'Rejecting…' : 'Reject'}
          </Button>
          {savedAt && actionState === 'idle' && <span className="text-xs text-success">Saved</span>}
        </div>
      </form>
    </Card>
  );
}
