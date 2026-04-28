export function ThemeScript() {
  // Runs before React hydration to avoid flash and to support system/light/dark.
  const code = `
(function () {
  try {
    var key = 'fyb:theme';
    var mode = localStorage.getItem(key) || 'system';
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var isDark = mode === 'dark' || (mode === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', !!isDark);
  } catch (e) {
    // ignore
  }
})();
`.trim();

  return (
    <script
      id="fyb-theme"
      dangerouslySetInnerHTML={{ __html: code }}
    />
  );
}
