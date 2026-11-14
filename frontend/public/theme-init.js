// Applies the colour mode and the organization's theme colour before first paint (no flash on reload). A file, not
// inline, so the content security policy can forbid inline scripts entirely.
try {
  localStorage.removeItem('vector.appliedTheme')
  // The super admin portal keeps its own theme (and Vector's own colours), separate from the organization's tabs.
  var superAdminPath = /^\/super-?admin(\/|$|\?)/
  var redirect = new URLSearchParams(location.search).get('redirect') || ''
  var isSuperAdmin = superAdminPath.test(location.pathname) || superAdminPath.test(redirect)
  var mode = localStorage.getItem(isSuperAdmin ? 'vector.superAdmin.theme' : 'vector.theme') || 'auto'
  // Dim is the dark theme with softer, blue-grey surfaces: both classes.
  var dark = mode === 'dark' || mode === 'dim' || (mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
  if (dark) document.documentElement.classList.add('dark')
  if (mode === 'dim') document.documentElement.classList.add('dim')
  var brand = isSuperAdmin ? null : JSON.parse(localStorage.getItem('vector.brand') || 'null')
  if (brand) for (var name in brand) document.documentElement.style.setProperty(name, brand[name])
} catch (error) {}
