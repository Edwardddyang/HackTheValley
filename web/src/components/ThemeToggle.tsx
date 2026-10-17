"use client";

/**
 * Sun/moon theme toggle. The inline script in layout.tsx applies the stored choice to
 * <html data-theme> before first paint; globals.css decides which icon shows from that same
 * attribute (plus the OS preference), so the server markup never depends on the stored choice
 * and there is nothing to mismatch on hydration.
 */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const dark = root.dataset.theme === "dark" ||
      (root.dataset.theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const next = dark ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch { /* private mode: the choice just won't stick */ }
  }
  return (
    <button type="button" onClick={toggle} aria-label="Switch between light and dark"
      className="rounded-full border border-hairline bg-surface p-2 text-ink-2 shadow-sm transition hover:border-accent/40 hover:bg-accent-tint hover:text-accent">
      <svg className="icon-moon h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
      <svg className="icon-sun h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  );
}
