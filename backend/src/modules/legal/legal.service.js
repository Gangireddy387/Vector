import { WorkspaceSetting } from '../workspace/workspace-setting.model.js';
import { emitToAll } from '../../shared/realtime/socket.js';

const DEFAULTS = {
  companyName: 'Vector',
  productName: 'Vector',
  contactEmail: 'privacy@example.com',
  contactPhone: '',
  postalAddress: '',
  jurisdiction: 'the country in which the company is registered',
  effectiveDate: '24 October 2026',
};

const trim = (value, max) => String(value ?? '').trim().slice(0, max);

function normalize(raw = {}) {
  return {
    companyName: trim(raw.companyName, 120) || DEFAULTS.companyName,
    productName: DEFAULTS.productName,
    contactEmail: trim(raw.contactEmail, 120) || DEFAULTS.contactEmail,
    contactPhone: trim(raw.contactPhone, 40),
    postalAddress: trim(raw.postalAddress, 300),
    jurisdiction: trim(raw.jurisdiction, 200) || DEFAULTS.jurisdiction,
    effectiveDate: trim(raw.effectiveDate, 60) || DEFAULTS.effectiveDate,
  };
}

async function settingsRow() {
  const [row] = await WorkspaceSetting.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1, name: 'Vector', defaultMode: 'system' },
  });
  return row;
}

/** Public Privacy / Terms contact details (super-admin editable). */
export async function getLegalContact() {
  const row = await settingsRow();
  return { legal: normalize(row.legal ?? {}) };
}

export async function updateLegalContact(changes, actorId = null) {
  const row = await settingsRow();
  const next = normalize({ ...(row.legal ?? {}), ...changes });
  row.legal = next;
  if (actorId) row.updatedById = actorId;
  await row.save();
  emitToAll('legal:updated', { legal: next });
  return { legal: next };
}
