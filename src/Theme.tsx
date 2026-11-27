import { useLayoutEffect, useState } from 'react';

const preferenceKey = 'product-bet-studio:theme:v1';
const themes = ['paper', 'midnight', 'field-notes'] as const;
type Theme = typeof themes[number];

function isTheme(value: string | null): value is Theme {
  return themes.some(theme => theme === value);
}

function readPreference(): { theme: Theme; message: string } {
  try {
    const saved = localStorage.getItem(preferenceKey);
    return { theme: isTheme(saved) ? saved : 'paper', message: saved && !isTheme(saved) ? 'Saved theme was not recognized. Using Paper.' : '' };
  } catch {
    return { theme: 'paper', message: 'Theme storage is unavailable. Your selection will apply only in this tab.' };
  }
}

export function ThemeSelector() {
  const [preference, setPreference] = useState(readPreference);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = preference.theme;
  }, [preference.theme]);

  return <div className="theme-control">
    <label htmlFor="studio-theme">Theme</label>
    <select id="studio-theme" value={preference.theme} onChange={event => {
      const theme = event.target.value;
      if (!isTheme(theme)) return;
      let message = '';
      try { localStorage.setItem(preferenceKey, theme); }
      catch { message = 'Could not save your theme preference. It still applies in this tab.'; }
      setPreference({ theme, message });
    }}>
      <option value="paper">Paper</option>
      <option value="midnight">Midnight</option>
      <option value="field-notes">Field Notes</option>
    </select>
    {preference.message && <small className="theme-feedback" role="status">{preference.message}</small>}
  </div>;
}
