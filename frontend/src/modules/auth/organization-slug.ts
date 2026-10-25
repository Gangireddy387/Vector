/** Turns an organization name into an address part: "Acme Corp." becomes "acme-corp". Mirrors the server. */
export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')

/** Where an organization lives: its address comes right after the domain, e.g. "app.example.com/acme". */
export const organizationAddress = (slug: string) => `${window.location.host}/${slug}`
export const organizationUrl = (slug: string, path = '') => `${window.location.origin}/${slug}${path}`
