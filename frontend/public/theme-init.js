// Applies the colour mode and the organization's theme colour before first paint (no flash on reload). A file, not
// inline, so the content security policy can forbid inline scripts entirely.
try {
  localStorage.removeItem('vector.appliedTheme')
  var mode = localStorage.getItem('vector.theme') || 'auto'
  var dark = mode === 'dark' || (mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
  if (dark) document.documentElement.classList.add('dark')
  // The super admin portal always uses Vector's own colours.
  var brand = location.pathname.indexOf('/super-admin') === 0 ? null : JSON.parse(localStorage.getItem('vector.brand') || 'null')
  if (brand) for (var name in brand) document.documentElement.style.setProperty(name, brand[name])
} catch (error) {}
