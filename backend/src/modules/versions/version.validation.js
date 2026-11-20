import { z } from 'zod';
import { VERSION_STATUSES } from './version.model.js';

const uuid = z.string().uuid();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format').nullable();

const versionFields = {
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(5000).nullable(),
  startDate: dateOnly,
  releaseDate: dateOnly,
  releaseNotes: z.string().max(100000).nullable(),
  position: z.number().int().min(0).max(100000),
};

export const createVersionSchema = z.object({
  name: versionFields.name,
  description: versionFields.description.optional().default(null),
  startDate: versionFields.startDate.optional().default(null),
  releaseDate: versionFields.releaseDate.optional().default(null),
  releaseNotes: versionFields.releaseNotes.optional().default(null),
});

export const updateVersionSchema = z
  .object({
    ...versionFields,
    status: z.enum(VERSION_STATUSES),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const generateNotesSchema = z.object({
  overwrite: z.boolean().optional().default(true),
});

export const listVersionsQuery = z.object({
  status: z.enum(VERSION_STATUSES).optional(),
});
