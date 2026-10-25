import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import * as controller from './issue.controller.js';
import {
  bulkDeleteSchema,
  bulkUpdateSchema,
  createIssueSchema,
  createLinkSchema,
  listIssuesQuery,
  moveIssueSchema,
  updateIssueSchema,
} from './issue.validation.js';

const router = Router();

router.get('/issues', validate({ query: listIssuesQuery }), controller.list);
router.post('/issues', validate({ body: createIssueSchema }), controller.create);
router.get('/issues/my-work', controller.myWork);
router.patch('/issues/bulk', validate({ body: bulkUpdateSchema }), controller.bulkUpdate);
router.post('/issues/bulk-delete', validate({ body: bulkDeleteSchema }), controller.bulkDelete);

router.get('/issues/:issueId', controller.show);
router.patch('/issues/:issueId', validate({ body: updateIssueSchema }), controller.update);
router.patch('/issues/:issueId/move', validate({ body: moveIssueSchema }), controller.move);
router.delete('/issues/:issueId', controller.remove);

router.post('/issues/:issueId/watchers', controller.watch);
router.delete('/issues/:issueId/watchers', controller.unwatch);

router.post('/issues/:issueId/links', validate({ body: createLinkSchema }), controller.createLink);
router.delete('/issue-links/:linkId', controller.deleteLink);

export default router;
