'use client';

// The single owner of import interaction state (IMPT-01..05). A progressive
// (NOT wizard) flow — everything stays visible at once, sections reveal as
// data arrives, and nothing ever navigates away or auto-redirects (the
// locked single-progressive-page + result-summary decisions). This is the
// ONLY place the import UI touches the Server Actions: previewImport on file
// select, commitImport on confirm — both re-send the same File (the server
// re-parses; this component never ships parsed row data).

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { ImportDropzone } from '@/components/import/ImportDropzone';
import { PreviewTable } from '@/components/import/PreviewTable';
import { SymbolMappingSection } from '@/components/import/SymbolMappingSection';
import { ImportSummary } from '@/components/import/ImportSummary';
import { previewImport, commitImport } from '@/server-actions/import';
import type { CommitChoices, ImportBroker, ImportPreview, ImportResult } from '@/lib/import/types';

type Phase = 'idle' | 'previewing' | 'preview' | 'committing' | 'done';
type Preview = Extract<ImportPreview, { ok: true }>;
type CommitResult = Extract<ImportResult, { ok: true }>;

const DEFAULT_CHOICES: CommitChoices = { importDuplicates: false, importUnsupported: false, mappings: [] };

export function ImportPage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [choices, setChoices] = useState<CommitChoices>(DEFAULT_CHOICES);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Groww rows carry their own ISIN in the source file — surface it so
  // SymbolMappingSection can prefill "create new instrument" without ever
  // fabricating a Robinhood ISIN (the file has none there).
  const growwIsinBySymbol = useMemo(() => {
    if (!preview || preview.broker !== 'groww') return undefined;
    const map: Record<string, string> = {};
    for (const row of preview.rows) {
      if (row.status === 'unmatched' && row.isin && !map[row.symbol]) {
        map[row.symbol] = row.isin;
      }
    }
    return map;
  }, [preview]);

  const runPreview = (selectedFile: File, broker?: ImportBroker) => {
    setPhase('previewing');
    setPreviewError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('file', selectedFile);
      if (broker) fd.set('broker', broker);
      const res = await previewImport(fd);
      if (res.ok) {
        setPreview(res);
        setChoices(DEFAULT_CHOICES);
        setPhase('preview');
      } else {
        setPreviewError(res.error);
        setPreview(null);
        setPhase('idle');
      }
    });
  };

  const handleFile = (selectedFile: File) => {
    setFile(selectedFile);
    setResult(null);
    setCommitError(null);
    runPreview(selectedFile);
  };

  const retryWithBroker = (broker: ImportBroker) => {
    if (!file) return;
    runPreview(file, broker);
  };

  const unresolvedSymbols = preview
    ? preview.unmatchedSymbols.filter((s) => !choices.mappings.some((m) => m.brokerSymbol === s))
    : [];
  const commitDisabled = !preview || phase === 'committing' || unresolvedSymbols.length > 0;

  const handleCommit = () => {
    if (!file || !preview) return;
    setCommitError(null);
    setPhase('committing');
    startTransition(async () => {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('choices', JSON.stringify(choices));
      const res = await commitImport(fd);
      if (res.ok) {
        setResult(res);
        setPhase('done');
      } else {
        setCommitError(res.error);
        setPhase('preview');
      }
    });
  };

  const reset = () => {
    setPhase('idle');
    setFile(null);
    setPreview(null);
    setPreviewError(null);
    setChoices(DEFAULT_CHOICES);
    setResult(null);
    setCommitError(null);
  };

  const brokerDetectionFailed = previewError?.toLowerCase().includes('could not detect broker') ?? false;

  return (
    <div className="space-y-6">
      {phase !== 'done' && (
        <ImportDropzone onFile={handleFile} disabled={phase === 'previewing' || phase === 'committing'} />
      )}

      {phase === 'previewing' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Parsing file…
        </p>
      )}

      {previewError && (
        <div className="glass-card rounded-2xl border border-danger/30 p-5 space-y-3">
          <p className="flex items-start gap-2 text-sm text-danger">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            {previewError}
          </p>
          {brokerDetectionFailed && file && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Tell us which broker this file is from:</span>
              <button
                type="button"
                onClick={() => retryWithBroker('groww')}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-muted/40 border border-border hover:bg-muted/60 transition-colors cursor-pointer"
              >
                Groww (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => retryWithBroker('robinhood')}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-muted/40 border border-border hover:bg-muted/60 transition-colors cursor-pointer"
              >
                Robinhood (.csv)
              </button>
            </div>
          )}
        </div>
      )}

      {(phase === 'preview' || phase === 'committing') && preview && (
        <>
          {preview.priorBatch && (
            <div className="glass-card rounded-2xl border border-warning/30 bg-warning/5 p-4">
              <p className="text-xs text-warning">
                This exact file was imported on{' '}
                {new Date(preview.priorBatch.importedAt).toLocaleDateString()} —{' '}
                {preview.priorBatch.importedCount} imported, {preview.priorBatch.duplicateCount} duplicates.
              </p>
            </div>
          )}

          {preview.unmatchedSymbols.length > 0 && (
            <SymbolMappingSection
              broker={preview.broker}
              unmatchedSymbols={preview.unmatchedSymbols}
              growwIsinBySymbol={growwIsinBySymbol}
              value={choices.mappings}
              onChange={(mappings) => setChoices({ ...choices, mappings })}
            />
          )}

          <PreviewTable preview={preview} choices={choices} onChoicesChange={setChoices} />

          {commitError && (
            <p className="flex items-center gap-2 text-sm text-danger">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {commitError}
            </p>
          )}

          <div className="glass-card rounded-2xl border border-border/50 p-4 flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              {unresolvedSymbols.length > 0
                ? `${unresolvedSymbols.length} unmatched symbol${unresolvedSymbols.length === 1 ? '' : 's'} still need${unresolvedSymbols.length === 1 ? 's' : ''} to be resolved above before you can import.`
                : 'Ready to import.'}
            </p>
            <button
              type="button"
              onClick={handleCommit}
              disabled={commitDisabled}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl shadow-md shadow-primary/20 hover:bg-primary/90 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary shrink-0"
            >
              {phase === 'committing' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing…
                </>
              ) : (
                'Commit import'
              )}
            </button>
          </div>
        </>
      )}

      {phase === 'done' && result && <ImportSummary result={result} onReset={reset} />}
    </div>
  );
}
