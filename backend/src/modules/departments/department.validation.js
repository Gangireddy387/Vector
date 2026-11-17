import { z } from 'zod';

const uuid = z.string().uuid();
const name = z.string().trim().min(2, 'Name must be at least 2 characters').max(80);
/** Empty strings become null so the API and forms stay consistent. */
const description = z
  .string()
  .trim()
  .max(300)
  .nullable()
  .optional()
  .transform((value) => (value === '' ? null : value));
const personId = z.string().uuid('Choose someone from the list').nullable().optional();

export const departmentIdParams = z.object({ departmentId: uuid });
export const teamIdParams = z.object({ teamId: uuid });
export const teamProjectParams = z.object({ teamId: uuid, projectId: uuid });

export const departmentSchema = z.object({ name, description, headId: personId });
export const teamSchema = z.object({
  name,
  description,
  leadId: personId,
  memberIds: z.array(uuid).max(500).optional().transform((ids) => (ids ? [...new Set(ids)] : ids)),
});

const atLeastOne = (schema) => schema.partial().refine((value) => Object.keys(value).length > 0, 'Provide at least one change');

export const createDepartmentSchema = departmentSchema;
export const updateDepartmentSchema = atLeastOne(departmentSchema);
export const createTeamSchema = teamSchema;
export const updateTeamSchema = atLeastOne(teamSchema.extend({ departmentId: uuid.optional() }));
export const assignProjectSchema = z.object({ projectId: z.string().uuid('Choose a project') });
