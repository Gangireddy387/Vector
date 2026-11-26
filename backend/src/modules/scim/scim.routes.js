import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../../shared/errors/api-error.js';
import { validate } from '../../shared/middleware/validate.js';
import { requireOrgPermission } from '../../shared/middleware/authenticate.js';
import { requireFeature } from '../plans/plan.service.js';
import { requireScimAuth } from './scim.auth.js';
import { SCIM_SCHEMAS, toScimError } from './scim.mapper.js';
import * as scim from './scim.service.js';

const scimJson = (res, status, body) => {
  res.status(status).type('application/scim+json').json(body);
};

/** Admin: create / list / revoke SCIM tokens (session auth). */
export const scimAdminRoutes = Router();

scimAdminRoutes.get(
  '/workspace/scim/tokens',
  requireOrgPermission('workspace.manage'),
  requireFeature('scim'),
  async (req, res) => {
    res.json(await scim.listScimTokens(req.organization.id));
  },
);

scimAdminRoutes.post(
  '/workspace/scim/tokens',
  requireOrgPermission('workspace.manage'),
  requireFeature('scim'),
  validate({ body: z.object({ name: z.string().trim().min(2).max(80) }) }),
  async (req, res) => {
    res.status(201).json(await scim.createScimToken(req.organization, req.user, req.body));
  },
);

scimAdminRoutes.delete(
  '/workspace/scim/tokens/:tokenId',
  requireOrgPermission('workspace.manage'),
  requireFeature('scim'),
  validate({ params: z.object({ tokenId: z.string().uuid() }) }),
  async (req, res) => {
    res.json(await scim.revokeScimToken(req.organization, req.user, req.params.tokenId));
  },
);

scimAdminRoutes.get('/workspace/scim', requireOrgPermission('workspace.manage'), async (req, res) => {
  res.json({ scim: scim.scimSettingsFor(req.organization) });
});

/** Public SCIM 2.0 Users API (Bearer vscim_…). */
export const publicScimRoutes = Router();

publicScimRoutes.use('/scim/v2', requireScimAuth);

publicScimRoutes.get('/scim/v2/ServiceProviderConfig', (_req, res) => {
  scimJson(res, 200, {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: 'oauthbearertoken',
        name: 'OAuth Bearer Token',
        description: 'Organization SCIM token (vscim_…)',
        specUri: 'https://www.rfc-editor.org/rfc/rfc6750.html',
        primary: true,
      },
    ],
  });
});

publicScimRoutes.get('/scim/v2/Schemas', (_req, res) => {
  scimJson(res, 200, {
    schemas: [SCIM_SCHEMAS.LIST_SCHEMA],
    totalResults: 2,
    Resources: [
      {
        id: SCIM_SCHEMAS.USER_SCHEMA,
        name: 'User',
        description: 'User Account',
        attributes: [
          { name: 'userName', type: 'string', required: true, uniqueness: 'server' },
          { name: 'displayName', type: 'string', required: false },
          { name: 'active', type: 'boolean', required: false },
          { name: 'emails', type: 'complex', multiValued: true, required: false },
        ],
      },
      {
        id: SCIM_SCHEMAS.GROUP_SCHEMA,
        name: 'Group',
        description: 'Team (organization structure)',
        attributes: [
          { name: 'displayName', type: 'string', required: true, uniqueness: 'none' },
          { name: 'members', type: 'complex', multiValued: true, required: false },
        ],
      },
    ],
  });
});

publicScimRoutes.get('/scim/v2/ResourceTypes', (_req, res) => {
  scimJson(res, 200, {
    schemas: [SCIM_SCHEMAS.LIST_SCHEMA],
    totalResults: 2,
    Resources: [
      {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
        id: 'User',
        name: 'User',
        endpoint: '/Users',
        schema: SCIM_SCHEMAS.USER_SCHEMA,
      },
      {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
        id: 'Group',
        name: 'Group',
        endpoint: '/Groups',
        schema: SCIM_SCHEMAS.GROUP_SCHEMA,
      },
    ],
  });
});

publicScimRoutes.get('/scim/v2/Users', async (req, res) => {
  const list = await scim.listScimUsers(req.scimOrganization, {
    filter: req.query.filter,
    startIndex: req.query.startIndex,
    count: req.query.count,
  });
  scimJson(res, 200, list);
});

publicScimRoutes.post('/scim/v2/Users', async (req, res) => {
  const { status, resource } = await scim.createScimUser(req.scimOrganization, req.body);
  res.set('Location', resource.meta.location);
  scimJson(res, status, resource);
});

publicScimRoutes.get('/scim/v2/Users/:id', async (req, res) => {
  const resource = await scim.getScimUser(req.scimOrganization, req.params.id);
  scimJson(res, 200, resource);
});

publicScimRoutes.put('/scim/v2/Users/:id', async (req, res) => {
  const resource = await scim.replaceScimUser(req.scimOrganization, req.params.id, req.body);
  scimJson(res, 200, resource);
});

publicScimRoutes.patch('/scim/v2/Users/:id', async (req, res) => {
  const resource = await scim.patchScimUser(req.scimOrganization, req.params.id, req.body);
  scimJson(res, 200, resource);
});

publicScimRoutes.delete('/scim/v2/Users/:id', async (req, res) => {
  await scim.deleteScimUser(req.scimOrganization, req.params.id);
  res.status(204).end();
});

publicScimRoutes.get('/scim/v2/Groups', async (req, res) => {
  const list = await scim.listScimGroups(req.scimOrganization, {
    filter: req.query.filter,
    startIndex: req.query.startIndex,
    count: req.query.count,
  });
  scimJson(res, 200, list);
});

publicScimRoutes.post('/scim/v2/Groups', async (req, res) => {
  const { status, resource } = await scim.createScimGroup(req.scimOrganization, req.body);
  res.set('Location', resource.meta.location);
  scimJson(res, status, resource);
});

publicScimRoutes.get('/scim/v2/Groups/:id', async (req, res) => {
  const resource = await scim.getScimGroup(req.scimOrganization, req.params.id);
  scimJson(res, 200, resource);
});

publicScimRoutes.put('/scim/v2/Groups/:id', async (req, res) => {
  const resource = await scim.replaceScimGroup(req.scimOrganization, req.params.id, req.body);
  scimJson(res, 200, resource);
});

publicScimRoutes.patch('/scim/v2/Groups/:id', async (req, res) => {
  const resource = await scim.patchScimGroup(req.scimOrganization, req.params.id, req.body);
  scimJson(res, 200, resource);
});

publicScimRoutes.delete('/scim/v2/Groups/:id', async (req, res) => {
  await scim.deleteScimGroup(req.scimOrganization, req.params.id);
  res.status(204).end();
});

publicScimRoutes.use('/scim/v2', (err, _req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err instanceof ApiError ? err.status : 500;
  const detail = err?.message || 'Something went wrong';
  scimJson(res, status, toScimError(status, detail, err?.scimType));
});
