import { z } from 'zod';

export const draftIssueSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(3, 'Describe the work in a few words').max(255),
  description: z.string().max(10000).nullable().optional(),
});
