import { z } from 'zod';

export const draftIssueSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(3, 'Describe the work in a few words').max(255),
  description: z.string().max(10000).nullable().optional(),
});

/** Issue id (UUID) or key like VEC-12. */
export const issueRefParams = z.object({
  issueId: z.string().trim().min(1).max(40),
});

export const WRITING_MODES = ['complete', 'polish', 'grammar', 'clearer', 'shorten', 'expand'];

export const writingAssistSchema = z.object({
  text: z.string().max(12_000),
  /** Optional highlighted slice; when set, rewrite applies to this and is merged back. */
  selection: z.string().max(8_000).optional(),
  mode: z.enum(WRITING_MODES),
  /** Where the text lives — tunes tone (wiki vs issue vs comment). */
  surface: z.enum(['wiki', 'issue', 'comment', 'general']).optional().default('general'),
  /** Scopes project AI instructions + issue retrieval. */
  projectId: z.string().uuid().optional().nullable(),
});

export const writingSuggestSchema = z.object({
  text: z.string().max(12_000),
  count: z.number().int().min(1).max(5).optional().default(3),
  surface: z.enum(['wiki', 'issue', 'comment', 'general']).optional().default('general'),
  projectId: z.string().uuid().optional().nullable(),
});
