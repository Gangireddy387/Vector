import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import * as controller from './comment.controller.js';
import { commentBodySchema } from './comment.validation.js';

const router = Router();

router.get('/issues/:issueId/comments', controller.list);
router.post('/issues/:issueId/comments', validate({ body: commentBodySchema }), controller.create);
router.patch('/comments/:commentId', validate({ body: commentBodySchema }), controller.update);
router.delete('/comments/:commentId', controller.remove);

export default router;
