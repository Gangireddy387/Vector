import { ApiError } from '../errors/api-error.js';

const formatIssues = (error) =>
  error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));

/**
 * Validates request parts with zod schemas.
 * Parsed `query` values are exposed as `req.filters` because Express 5 makes `req.query` read-only.
 */
export const validate = (schemas) => (req, _res, next) => {
  for (const [source, schema] of Object.entries(schemas)) {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) {
      return next(ApiError.badRequest('Validation failed', formatIssues(result.error)));
    }
    if (source === 'query') req.filters = result.data;
    else req[source] = result.data;
  }
  return next();
};
