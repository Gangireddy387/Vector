import * as workspaceService from './workspace.service.js';

export const show = async (_req, res) => res.json({ settings: workspaceService.getDefaultBranding() });
