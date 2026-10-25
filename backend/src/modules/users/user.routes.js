import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import * as controller from './user.controller.js';
import { searchUsersQuery } from './user.validation.js';

const router = Router();

router.get('/', validate({ query: searchUsersQuery }), controller.search);

export default router;
