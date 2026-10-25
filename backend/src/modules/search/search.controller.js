import { globalSearch } from './search.service.js';

export const search = async (req, res) => res.json(await globalSearch(req.user.id, req.filters));
