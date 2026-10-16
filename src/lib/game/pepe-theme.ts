/** Device-only CEO test. The same key is read by the script in routes/__root.tsx. */
export const PEPE_THEME_KEY = "dks-pepe-theme";

export function pepeThemeOn(): boolean {
  try {
    return localStorage.getItem(PEPE_THEME_KEY) === "on";
  } catch {
    return false;
  }
}

export function applyPepeTheme(on: boolean) {
  const root = document.documentElement;
  if (on) root.dataset.pepe = "on";
  else delete root.dataset.pepe;
}

export function setPepeTheme(on: boolean) {
  try {
    if (on) localStorage.setItem(PEPE_THEME_KEY, "on");
    else localStorage.removeItem(PEPE_THEME_KEY);
  } catch {
    /* private mode */
  }
  applyPepeTheme(on);
}
