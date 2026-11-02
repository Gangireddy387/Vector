/** Identifiers and names shared across modules. */

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a value (from a URL, a socket message…) is a well-formed id, before it reaches the database. */
export const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);

/** A web-address-friendly version of a name: "Café Acme Corp." → "cafe-acme-corp" (`fallback` when nothing is left). */
export const slugify = (value, fallback = '') =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '') || fallback;
