import * as service from './portfolio.service.js';

export const rollup = async (req, res) => {
  res.json(await service.getPortfolioRollup(req.user.id, req.filters ?? {}));
};
