/** Splits comma-separated query values ("bug,task") into a clean array. */
export const toList = (value) => {
  if (value === undefined || value === null || value === '') return [];
  const items = Array.isArray(value) ? value : String(value).split(',');
  return items.map((item) => String(item).trim()).filter(Boolean);
};

export const startOfDay = (date = new Date()) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

export const addDays = (date, days) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

/** Formats a Date as YYYY-MM-DD in local time (matches DATEONLY columns). */
export const toDateOnly = (date) => {
  const value = new Date(date);
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
};

export const interpolate = (template, variables) =>
  String(template ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key) => {
    const value = key.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), variables);
    return value == null ? '' : String(value);
  });
