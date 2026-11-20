import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { requireFeature } from '../plans/plan.service.js';
import * as controller from './portfolio.controller.js';
import { rollupQuery } from './portfolio.validation.js';

const router = Router();
const feature = requireFeature('portfolio');

router.get('/portfolio/rollup', feature, validate({ query: rollupQuery }), controller.rollup);

export default router;
