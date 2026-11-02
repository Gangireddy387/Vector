// Applies the colour mode before first paint (no flash on reload). A file, not inline, so the content security policy
// can forbid inline scripts entirely.
try {
  localStorage.removeItem('vector.appliedTheme')
  var mode = localStorage.getItem('vector.theme') || 'auto'
  var dark = mode === 'dark' || (mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
  if (dark) document.documentElement.classList.add('dark')
} catch (error) {}
