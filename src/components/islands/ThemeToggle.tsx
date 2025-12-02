import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? true;
    const initial = saved ? saved === 'dark' : prefersDark;
    setIsDark(initial);

    const root = document.documentElement;
    root.classList.toggle('dark', initial);
    root.classList.toggle('light', !initial);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.classList.toggle('light', !isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark, mounted]);

  return (
    <button
      type="button"
      aria-label="Toggle color scheme"
      className="btn-ghost rounded-xl p-2"
      onClick={() => setIsDark((v) => !v)}
    >
      <span className="sr-only">Toggle theme</span>
      {/* 다크: 달, 라이트: 해 */}
      <svg
        className={`h-6 w-6 ${isDark ? 'inline-block' : 'hidden'}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
      <svg
        className={`h-6 w-6 ${isDark ? 'hidden' : 'inline-block'}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="4"></circle>
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    </button>
  );
}
