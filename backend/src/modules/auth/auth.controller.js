import * as authService from './auth.service.js';

export const register = async (req, res) => res.status(201).json(await authService.register(req.body));
export const login = async (req, res) => res.json(await authService.login(req.body));
export const me = async (req, res) =>
  res.json(await authService.describeSession(req.user, req.organizationMemberships.find((membership) => membership.organizationId === req.organization?.id), req.organizationMemberships));

export const forgotPassword = async (req, res) => {
  await authService.requestPasswordReset(req.body);
  res.json({ message: 'If an account exists for that email, a reset link is on its way.' });
};

export const resetPassword = async (req, res) => res.json(await authService.resetPassword(req.body));
export const acceptInvite = async (req, res) => res.json(await authService.acceptInvite(req.body));
export const updateProfile = async (req, res) => {
  const user = await authService.updateProfile(req.user, req.body);
  res.json({ user: { ...user, workspaceRole: req.organizationRole ?? 'member' } });
};

export const changePassword = async (req, res) => {
  await authService.changePassword(req.user, req.body);
  res.status(204).end();
};
