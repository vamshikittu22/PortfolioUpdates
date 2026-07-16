'use client';

// IMPT-01/02 entry point — pure view, no Server Action calls. The container
// (04-06) owns previewImport; this component only reports a chosen File up
// via onFile after an honest client-side size pre-check (matches the 4mb
// next.config.ts serverActions.bodySizeLimit set in 04-04 — see 04-RESEARCH
// Pitfall 3).

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Upload, FileText } from 'lucide-react';
import { cn } from '@/utils/cn';

const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4MB — mirrors next.config.ts's bodySizeLimit

interface ImportDropzoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function ImportDropzone({ onFile, disabled }: ImportDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File | undefined | null) => {
    if (!file || disabled) return;
    setError(null);

    if (file.size > MAX_FILE_BYTES) {
      // Honest inline error — never silently truncated or forwarded to a
      // Server Action that would just reject it with a worse message.
      setError(
        `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)}MB, over the 4MB import limit. Export a smaller date range and try again.`
      );
      return;
    }

    setFileName(file.name);
    onFile(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0]);
    // Reset so choosing the same file name again (e.g. after Import another
    // file) still fires a change event.
    e.target.value = '';
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      className={cn(
        'glass-card rounded-2xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer',
        isDragging ? 'border-primary bg-primary/5' : 'border-border/50',
        disabled && 'opacity-60 cursor-not-allowed pointer-events-none'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.csv"
        onChange={handleChange}
        disabled={disabled}
        className="hidden"
      />
      <div className="flex flex-col items-center gap-3">
        {fileName ? (
          <>
            <FileText className="h-8 w-8 text-primary" />
            <p className="text-sm font-semibold text-foreground">{fileName}</p>
            <p className="text-xs text-muted-foreground">Click or drop to choose a different file</p>
          </>
        ) : (
          <>
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">
              Drop your Groww (.xlsx) or Robinhood (.csv) export here
            </p>
            <p className="text-xs text-muted-foreground">or click to browse — up to 4MB</p>
          </>
        )}
      </div>
      {error && <p className="mt-3 text-danger text-xs">{error}</p>}
    </div>
  );
}
