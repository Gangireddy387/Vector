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

/** Where an organization lives, e.g. "app.example.com/o/acme". */
export const organizationAddress = (slug: string) => `${window.location.host}/o/${slug}`
export const organizationUrl = (slug: string, path = '') => `${window.location.origin}/o/${slug}${path}`
