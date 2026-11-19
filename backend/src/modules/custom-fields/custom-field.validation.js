import { z } from 'zod';
import { CUSTOM_FIELD_TYPES } from './custom-field.model.js';

const uuid = z.string().uuid();

const optionsSchema = z.array(z.string().trim().min(1).max(80)).max(50);

const fieldBody = {
  name: z.string().trim().min(1).max(80),
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{0,39}$/, 'Key must start with a letter and use only lowercase letters, numbers and underscores')
    .optional(),
  type: z.enum(CUSTOM_FIELD_TYPES),
  options: optionsSchema.default([]),
  required: z.boolean().default(false),
  description: z.string().trim().max(255).nullable().optional(),
  position: z.number().int().min(0).max(1000).optional(),
};

export const createCustomFieldSchema = z
  .object(fieldBody)
  .superRefine((value, ctx) => {
    if ((value.type === 'select' || value.type === 'multi_select') && !value.options.length) {
      ctx.addIssue({ code: 'custom', message: 'Select fields need at least one option', path: ['options'] });
    }
  });

export const updateCustomFieldSchema = z
  .object({
    name: fieldBody.name.optional(),
    options: optionsSchema.optional(),
    required: z.boolean().optional(),
    description: z.string().trim().max(255).nullable().optional(),
    position: z.number().int().min(0).max(1000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const reorderCustomFieldsSchema = z.object({
  fieldIds: z.array(uuid).min(1).max(100),
});

/** Values keyed by field id, sent on create/update issue. */
export const customFieldValuesSchema = z.record(uuid, z.unknown());
