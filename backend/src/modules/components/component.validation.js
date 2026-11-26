import { z } from 'zod';

const componentFields = {
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
};

export const createComponentSchema = z.object({
  name: componentFields.name,
  description: componentFields.description.default(null),
  color: componentFields.color.default('#64748b'),
});

export const updateComponentSchema = z.object(componentFields).partial();
