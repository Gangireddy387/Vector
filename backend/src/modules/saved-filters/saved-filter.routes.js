import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import * as controller from './saved-filter.controller.js';
import { createSavedFilterSchema, updateSavedFilterSchema } from './saved-filter.validation.js';

const router = Router();

router.get('/saved-filters', controller.list);
router.post('/saved-filters', validate({ body: createSavedFilterSchema }), controller.create);
router.patch('/saved-filters/:filterId', validate({ body: updateSavedFilterSchema }), controller.update);
router.delete('/saved-filters/:filterId', controller.remove);

export default router;
