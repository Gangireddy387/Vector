import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../shared/middleware/validate.js';
import { requireFeature } from '../plans/plan.service.js';
import * as controller from './goal.controller.js';
import {
  createGoalSchema,
  createKeyResultSchema,
  createLinkSchema,
  goalIdParams,
  keyResultParams,
  linkParams,
  listGoalsQuery,
  updateGoalSchema,
  updateKeyResultSchema,
} from './goal.validation.js';

const router = Router();
const feature = requireFeature('goals');

router.get('/goals', feature, validate({ query: listGoalsQuery }), controller.list);
router.post('/goals', feature, validate({ body: createGoalSchema }), controller.create);
router.get('/goals/linkable-issues', feature, validate({ query: z.object({ q: z.string().optional(), limit: z.coerce.number().int().min(1).max(50).optional() }) }), controller.searchIssues);
router.get('/goals/:goalId', feature, validate({ params: goalIdParams }), controller.get);
router.patch('/goals/:goalId', feature, validate({ params: goalIdParams, body: updateGoalSchema }), controller.update);
router.delete('/goals/:goalId', feature, validate({ params: goalIdParams }), controller.remove);

router.post('/goals/:goalId/key-results', feature, validate({ params: goalIdParams, body: createKeyResultSchema }), controller.createKeyResult);
router.patch(
  '/goals/:goalId/key-results/:keyResultId',
  feature,
  validate({ params: keyResultParams, body: updateKeyResultSchema }),
  controller.updateKeyResult,
);
router.delete('/goals/:goalId/key-results/:keyResultId', feature, validate({ params: keyResultParams }), controller.removeKeyResult);

router.post(
  '/goals/:goalId/key-results/:keyResultId/links',
  feature,
  validate({ params: keyResultParams, body: createLinkSchema }),
  controller.addLink,
);
router.delete(
  '/goals/:goalId/key-results/:keyResultId/links/:linkId',
  feature,
  validate({ params: linkParams }),
  controller.removeLink,
);

export default router;
