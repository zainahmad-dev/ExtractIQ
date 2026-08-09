'use client';

import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

const ACCEPTED_TYPES = 'application/pdf,image/png,image/jpeg';

export function DropZone({ onFilesSelected, disabled }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    onFilesSelected(Array.from(fileList));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    handleFiles(event.dataTransfer.files);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      inputRef.current?.click();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={handleKeyDown}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed p-10 text-center transition-colors',
        isDragging ? 'border-primary bg-primary/5' : 'border-surface-elevated bg-surface',
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      <Upload size={28} className="text-muted-foreground" />
      <div>
        <p className="text-sm font-medium">Drag and drop files here, or click to browse</p>
        <p className="mt-1 text-xs text-muted-foreground">PDF, PNG, or JPG — up to 25MB each</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES}
        className="sr-only"
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );
}
