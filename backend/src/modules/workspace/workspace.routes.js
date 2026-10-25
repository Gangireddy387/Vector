import { Router } from 'express';
import * as controller from './workspace.controller.js';

/** Public: branding for the sign-in pages before anyone is authenticated (each organization's own comes with the session). */
export const publicWorkspaceRoutes = Router();
publicWorkspaceRoutes.get('/workspace', controller.show);
