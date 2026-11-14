import { getUserCard, searchUsers } from './user.service.js';

export const search = async (req, res) => res.json({ users: await searchUsers(req.user.id, req.filters) });
export const card = async (req, res) => res.json({ user: await getUserCard(req.params.userId) });
