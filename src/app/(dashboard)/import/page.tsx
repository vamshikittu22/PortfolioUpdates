import { Upload } from 'lucide-react';
import { createClient } from '@/utils/supabase/server';
import { ImportPage } from '@/components/import/ImportPage';

// Server Component: same auth-guard pattern as holdings/page.tsx — no data
// fetching here. The client container (ImportPage) drives everything through
// the previewImport/commitImport Server Actions (IMPT-01..05). Named
// ImportRoutePage (not ImportPage) to avoid a name clash with the client
// component it renders.
export default async function ImportRoutePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="glass-card rounded-2xl p-5 border border-border/50">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Upload className="h-6 w-6 text-primary" />
          Import Holdings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Import a Groww holdings statement (.xlsx) or a Robinhood activity report (.csv). Nothing is
          committed until you review the preview.
        </p>
      </div>

      <ImportPage />
    </div>
  );
}
