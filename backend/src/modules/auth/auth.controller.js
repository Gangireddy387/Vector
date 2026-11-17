import * as apiTokenService from './api-token.service.js';
import * as authService from './auth.service.js';

export const register = async (req, res) => res.status(201).json(await authService.register(req.body));
export const login = async (req, res) => res.json(await authService.login(req.body));
export const verifyMfaLogin = async (req, res) => res.json(await authService.verifyMfaLogin(req.body));
export const me = async (req, res) =>
  res.json(await authService.describeSession(req.user, req.organizationMemberships.find((membership) => membership.organizationId === req.organization?.id), req.organizationMemberships));

export const forgotPassword = async (req, res) => {
  await authService.requestPasswordReset(req.body);
  res.json({ message: 'If an account exists for that email, a reset link is on its way.' });
};

export const resetPassword = async (req, res) => res.json(await authService.resetPassword(req.body));
export const acceptInvite = async (req, res) => res.json(await authService.acceptInvite(req.body));
export const acceptInviteQuick = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await authService.acceptInviteQuick(req.body));
};
export const updateProfile = async (req, res) => {
  const user = await authService.updateProfile(req.user, req.body);
  res.json({ user: { ...user, workspaceRole: req.organizationRole ?? 'member' } });
};

/** Other sessions are signed out; this one continues with the returned token. */
export const changePassword = async (req, res) => res.json(await authService.changePassword(req.user, req.body));
export const revokeOtherSessions = async (req, res) => res.json(await authService.revokeOtherSessions(req.user));

export const setupMfa = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await authService.setupMfa(req.user));
};
export const confirmMfa = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const result = await authService.confirmMfa(req.user, req.body);
  res.json({
    recoveryCodes: result.recoveryCodes,
    user: { ...result.user, workspaceRole: req.organizationRole ?? 'member' },
  });
};
export const disableMfa = async (req, res) => {
  const result = await authService.disableMfa(req.user, req.body);
  res.json({ user: { ...result.user, workspaceRole: req.organizationRole ?? 'member' } });
};
export const regenerateMfaRecovery = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await authService.regenerateMfaRecovery(req.user, req.body));
};

export const exportAccount = async (req, res) => {
  const payload = await authService.exportAccount(req.user);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="vector-account-export.json"`);
  res.json(payload);
};

export const deleteAccount = async (req, res) => {
  await authService.deleteAccount(req.user, req.body);
  res.status(204).end();
};

export const listApiTokens = async (req, res) => res.json(await apiTokenService.listApiTokens(req.user.id));
export const createApiToken = async (req, res) => res.status(201).json(await apiTokenService.createApiToken(req.user.id, req.body));
export const revokeApiToken = async (req, res) => res.json(await apiTokenService.revokeApiToken(req.user.id, req.params.tokenId));
