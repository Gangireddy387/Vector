import { getDashboard } from './dashboard.service.js';

export const show = async (req, res) => res.json(await getDashboard(req.user.id));
