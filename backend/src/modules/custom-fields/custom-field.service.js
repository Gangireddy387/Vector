import { CustomField, IssueCustomFieldValue } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';

const SELECT_TYPES = new Set(['select', 'multi_select']);

export const listCustomFields = (projectId) =>
  CustomField.findAll({ where: { projectId }, order: [['position', 'ASC'], ['name', 'ASC']] });

async function findField(projectId, fieldId) {
  const field = await CustomField.findOne({ where: { id: fieldId, projectId } });
  if (!field) throw ApiError.notFound('Custom field not found');
  return field;
}

function slugifyKey(name) {
  const base = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 40);
  if (!base || !/^[a-z]/.test(base)) return `field_${base || 'x'}`.slice(0, 40);
  return base;
}

async function uniqueKey(projectId, preferred) {
  let key = preferred;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const exists = await CustomField.count({ where: { projectId, key } });
    if (!exists) return key;
    const suffix = `_${attempt + 2}`;
    key = `${preferred.slice(0, 40 - suffix.length)}${suffix}`;
  }
  throw ApiError.badRequest('Could not generate a unique field key');
}

function normalizeOptions(type, options) {
  if (!SELECT_TYPES.has(type)) return [];
  const seen = new Set();
  const cleaned = [];
  for (const option of options ?? []) {
    const label = String(option).trim();
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    cleaned.push(label);
  }
  return cleaned;
}

export async function createCustomField(projectId, input) {
  const type = input.type ?? 'text';
  const options = normalizeOptions(type, input.options);
  if (SELECT_TYPES.has(type) && !options.length) throw ApiError.badRequest('Select fields need at least one option');

  const maxPosition = await CustomField.max('position', { where: { projectId } });
  const position = input.position ?? (Number.isFinite(maxPosition) ? maxPosition + 1 : 0);
  const key = await uniqueKey(projectId, input.key || slugifyKey(input.name));

  try {
    return await CustomField.create({
      projectId,
      name: input.name.trim(),
      key,
      type,
      options,
      required: Boolean(input.required),
      description: input.description ?? null,
      position,
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw ApiError.conflict('A custom field with that name already exists in this project');
    }
    throw error;
  }
}

export async function updateCustomField(projectId, fieldId, changes) {
  const field = await findField(projectId, fieldId);
  const next = {};
  if (changes.name !== undefined) next.name = changes.name.trim();
  if (changes.required !== undefined) next.required = Boolean(changes.required);
  if (changes.description !== undefined) next.description = changes.description;
  if (changes.position !== undefined) next.position = changes.position;
  if (changes.options !== undefined) {
    if (!SELECT_TYPES.has(field.type)) throw ApiError.badRequest('Only select fields have options');
    const options = normalizeOptions(field.type, changes.options);
    if (!options.length) throw ApiError.badRequest('Select fields need at least one option');
    next.options = options;
  }
  try {
    return await field.update(next);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw ApiError.conflict('A custom field with that name already exists in this project');
    }
    throw error;
  }
}

export async function reorderCustomFields(projectId, fieldIds) {
  const fields = await CustomField.findAll({ where: { projectId } });
  if (fieldIds.length !== fields.length || new Set(fieldIds).size !== fieldIds.length) {
    throw ApiError.badRequest('Provide every custom field id exactly once');
  }
  const byId = new Map(fields.map((field) => [field.id, field]));
  for (const id of fieldIds) {
    if (!byId.has(id)) throw ApiError.badRequest('One or more custom fields do not belong to this project');
  }
  await Promise.all(fieldIds.map((id, index) => byId.get(id).update({ position: index })));
  return listCustomFields(projectId);
}

export async function deleteCustomField(projectId, fieldId) {
  const field = await findField(projectId, fieldId);
  await IssueCustomFieldValue.destroy({ where: { fieldId: field.id } });
  await field.destroy();
}

/** Coerce and validate a raw value for a field definition. Empty → null (unless required). */
export function normalizeFieldValue(field, raw) {
  const empty = raw === undefined || raw === null || raw === '';
  if (empty || (Array.isArray(raw) && !raw.length)) {
    if (field.required) throw ApiError.badRequest(`“${field.name}” is required`);
    return null;
  }

  switch (field.type) {
    case 'text': {
      const text = String(raw).trim();
      if (!text) {
        if (field.required) throw ApiError.badRequest(`“${field.name}” is required`);
        return null;
      }
      if (text.length > 5000) throw ApiError.badRequest(`“${field.name}” is too long`);
      return text;
    }
    case 'url': {
      const text = String(raw).trim();
      if (!text) {
        if (field.required) throw ApiError.badRequest(`“${field.name}” is required`);
        return null;
      }
      try {
        const parsed = new URL(text);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
      } catch {
        throw ApiError.badRequest(`“${field.name}” must be a valid http(s) URL`);
      }
      if (text.length > 2000) throw ApiError.badRequest(`“${field.name}” is too long`);
      return text;
    }
    case 'number': {
      const number = typeof raw === 'number' ? raw : Number(String(raw).trim());
      if (!Number.isFinite(number)) throw ApiError.badRequest(`“${field.name}” must be a number`);
      return number;
    }
    case 'date': {
      const text = String(raw).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw ApiError.badRequest(`“${field.name}” must be YYYY-MM-DD`);
      return text;
    }
    case 'checkbox':
      return Boolean(raw);
    case 'select': {
      const text = String(raw).trim();
      if (!field.options.includes(text)) throw ApiError.badRequest(`“${field.name}” has an invalid option`);
      return text;
    }
    case 'multi_select': {
      if (!Array.isArray(raw)) throw ApiError.badRequest(`“${field.name}” must be a list of options`);
      const unique = [...new Set(raw.map((item) => String(item).trim()).filter(Boolean))];
      if (!unique.length) {
        if (field.required) throw ApiError.badRequest(`“${field.name}” is required`);
        return null;
      }
      if (unique.some((item) => !field.options.includes(item))) {
        throw ApiError.badRequest(`“${field.name}” has an invalid option`);
      }
      return unique;
    }
    default:
      throw ApiError.badRequest(`Unknown field type for “${field.name}”`);
  }
}

/**
 * Validates custom field values against project definitions.
 * Returns `{ fieldId → normalizedValue }` for fields present in the payload.
 */
export async function assertCustomFieldValues(projectId, valuesByFieldId) {
  if (!valuesByFieldId || typeof valuesByFieldId !== 'object') return {};
  const entries = Object.entries(valuesByFieldId);
  if (!entries.length) return {};

  const fields = await CustomField.findAll({ where: { projectId, id: entries.map(([id]) => id) } });
  if (fields.length !== entries.length) throw ApiError.badRequest('One or more custom fields do not belong to this project');

  const byId = new Map(fields.map((field) => [field.id, field]));
  const normalized = {};
  for (const [fieldId, raw] of entries) {
    normalized[fieldId] = normalizeFieldValue(byId.get(fieldId), raw);
  }
  return normalized;
}

export async function setIssueCustomFieldValues(issueId, valuesByFieldId, { transaction } = {}) {
  const entries = Object.entries(valuesByFieldId ?? {});
  for (const [fieldId, value] of entries) {
    if (value === null) {
      await IssueCustomFieldValue.destroy({ where: { issueId, fieldId }, transaction });
      continue;
    }
    const existing = await IssueCustomFieldValue.findOne({ where: { issueId, fieldId }, transaction });
    if (existing) await existing.update({ value }, { transaction });
    else await IssueCustomFieldValue.create({ issueId, fieldId, value }, { transaction });
  }
}

export async function loadIssueCustomFieldValues(issueIds) {
  if (!issueIds.length) return new Map();
  const rows = await IssueCustomFieldValue.findAll({
    where: { issueId: issueIds },
    attributes: ['issueId', 'fieldId', 'value'],
    raw: true,
  });
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row.issueId) ?? [];
    list.push({ fieldId: row.fieldId, value: row.value });
    map.set(row.issueId, list);
  }
  return map;
}

export function formatFieldValueForActivity(field, value) {
  if (value === null || value === undefined) return null;
  if (field.type === 'checkbox') return value ? 'Yes' : 'No';
  if (field.type === 'multi_select' && Array.isArray(value)) return value.join(', ') || null;
  return String(value);
}
