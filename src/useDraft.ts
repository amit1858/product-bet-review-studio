import { useEffect, useState } from 'react';
import { z } from 'zod';

export const DRAFT_KEY = 'product-bet-studio:opt-in-draft:v1';
const schema = z.object({ version: z.literal(1), idea: z.string().max(4000), context: z.string().max(14000) }).strict();
type Draft = z.infer<typeof schema>;

export function useDraft(idea: string, context: string) {
  const [saved, setSaved] = useState<Draft | null>(null);
  const [keeping, setKeeping] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DRAFT_KEY);
      if (stored) setSaved(schema.parse(JSON.parse(stored)));
    } catch { setError('Device draft storage is unavailable or unreadable. Nothing will be saved unless you choose it; you can remove the stored draft.'); }
  }, []);
  useEffect(() => {
    if (!keeping) return;
    try {
      const draft: Draft = { version: 1, idea, context };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setSaved(draft); setError('');
    } catch { setError('This browser could not save your draft. Keep this tab open or copy your text; do not rely on device storage.'); }
  }, [idea, context, keeping]);
  function forget() {
    setKeeping(false);
    try { localStorage.removeItem(DRAFT_KEY); setSaved(null); setError(''); }
    catch { setError('This browser could not delete the stored draft. Clear this site’s storage in browser settings.'); }
  }
  return {
    saved, keeping, error, forget,
    choose: (value: boolean) => { if (value) setKeeping(true); else forget(); },
    pauseSaving: () => setKeeping(false),
    resumeSaving: () => setKeeping(true),
  };
}
