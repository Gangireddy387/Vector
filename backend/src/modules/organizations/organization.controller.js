import { describeSession } from '../auth/auth.service.js';
import { getMemberProfile } from './member-profile.service.js';
import { listActiveMemberships } from './organization-access.js';
import * as organizationService from './organization.service.js';

const sessionFor = async (user, organizationId) => {
  const memberships = await listActiveMemberships(user.id);
  return describeSession(user, memberships.find((membership) => membership.organizationId === organizationId), memberships);
};

export const list = async (req, res) => res.json({ organizations: await organizationService.listMyOrganizations(req.organizationMemberships) });

export const create = async (req, res) => {
  const organization = await organizationService.createOrganization(req.user, req.body);
  res.status(201).json(await sessionFor(req.user, organization.id));
};

export const switchTo = async (req, res) => {
  await organizationService.switchOrganization(req.user, req.organizationMemberships, req.params.organizationId);
  res.json(await sessionFor(req.user, req.params.organizationId));
};

export const checkSlug = async (req, res) => res.json(await organizationService.checkSlug(req.filters.slug));
export const showPublic = async (req, res) => res.json({ organization: await organizationService.getPublicOrganization(req.params.slug) });

// Current organization (admins)
export const update = async (req, res) => res.json({ settings: await organizationService.updateOrganization(req.organization, req.user, req.body) });
export const uploadLogo = async (req, res) => res.json({ settings: await organizationService.setLogo(req.organization, req.user, req.file) });
export const removeLogo = async (req, res) => res.json({ settings: await organizationService.clearLogo(req.organization, req.user) });
export const showLogo = (req, res) => {
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(organizationService.resolveLogoFile(req.params.fileName));
};
export const showPlan = async (req, res) => res.json(await organizationService.getPlanOverview(req.organization));
export const listMembers = async (req, res) => res.json({ members: await organizationService.listMembers(req.organization.id) });
export const showMemberProfile = async (req, res) => res.json(await getMemberProfile(req.organization.id, req.params.userId));
export const updateMember = async (req, res) =>
  res.json({ member: await organizationService.updateMember(req.organization.id, req.user, req.params.userId, req.body) });
export const removeMember = async (req, res) => {
  await organizationService.removeMember(req.organization.id, req.user, req.params.userId);
  res.status(204).end();
};
export const remove = async (req, res) => {
  await organizationService.deleteOrganization(req.organization, req.body);
  res.status(204).end();
};
export const invite = async (req, res) => res.status(201).json({ member: await organizationService.inviteMember(req.organization, req.user, req.body) });
