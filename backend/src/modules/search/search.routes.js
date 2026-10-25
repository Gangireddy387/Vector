import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import * as controller from './search.controller.js';
import { searchQuery } from './search.validation.js';

const router = Router();

router.get('/search', validate({ query: searchQuery }), controller.search);

export default router;
