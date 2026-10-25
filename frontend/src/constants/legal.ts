/**
 * Details shown in the Privacy Policy and Terms of Service.
 * Set them per deployment in `.env` (VITE_LEGAL_*); the fallbacks are placeholders only.
 */
const env = import.meta.env

export const LEGAL = {
  companyName: env.VITE_LEGAL_COMPANY_NAME || 'Vector',
  productName: 'Vector',
  contactEmail: env.VITE_LEGAL_CONTACT_EMAIL || 'privacy@example.com',
  postalAddress: env.VITE_LEGAL_POSTAL_ADDRESS || '',
  jurisdiction: env.VITE_LEGAL_JURISDICTION || 'the country in which the company is registered',
  effectiveDate: env.VITE_LEGAL_EFFECTIVE_DATE || '24 October 2026',
}
