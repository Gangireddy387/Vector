import multer from 'multer';
import { ApiError } from '../errors/api-error.js';

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, _req, res, _next) {
  if (error instanceof ApiError) {
    return res.status(error.status).json({ message: error.message, details: error.details });
  }
  if (error.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      message: 'A record with the same unique value already exists',
      details: error.errors?.map((item) => ({ path: item.path, message: item.message })),
    });
  }
  if (error.name === 'SequelizeValidationError') {
    return res.status(400).json({
      message: 'Validation failed',
      details: error.errors?.map((item) => ({ path: item.path, message: item.message })),
    });
  }
  if (error.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({ message: 'A referenced record does not exist' });
  }
  // PostgreSQL: a malformed UUID in a URL or filter ("invalid input syntax").
  if (error.name === 'SequelizeDatabaseError' && error.parent?.code === '22P02') {
    return res.status(404).json({ message: 'Resource not found' });
  }
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ message: error.message });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Malformed JSON body' });
  }

  console.error('[error]', error);
  return res.status(500).json({ message: 'Something went wrong. Please try again.' });
}
