import { z } from 'zod';

const labelFields = {
  name: z.string().trim().toLowerCase().min(1).max(40),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
};

export const createLabelSchema = z.object({ name: labelFields.name, color: labelFields.color.default('#64748b') });

export const updateLabelSchema = z.object(labelFields).partial();
