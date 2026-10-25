import { searchUsers } from './user.service.js';

export const search = async (req, res) => res.json({ users: await searchUsers(req.user.id, req.filters) });
