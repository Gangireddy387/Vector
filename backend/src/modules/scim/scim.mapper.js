const USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
const GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group';
const LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
const ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';
const PATCH_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';

export const SCIM_SCHEMAS = { USER_SCHEMA, GROUP_SCHEMA, LIST_SCHEMA, ERROR_SCHEMA, PATCH_SCHEMA };

/** Parse `userName eq "value"` (and a few common variants). Returns null if unsupported. */
export function parseUserNameFilter(raw) {
  if (raw == null || raw === '') return null;
  const text = String(raw).trim();
  const match = text.match(/^userName\s+eq\s+"([^"]*)"$/i) || text.match(/^userName\s+eq\s+'([^']*)'$/i);
  if (!match) return undefined; // present but unsupported
  return match[1].trim().toLowerCase();
}

/** Parse `displayName eq "value"` for Groups. Returns null if empty; undefined if unsupported. */
export function parseDisplayNameFilter(raw) {
  if (raw == null || raw === '') return null;
  const text = String(raw).trim();
  const match = text.match(/^displayName\s+eq\s+"([^"]*)"$/i) || text.match(/^displayName\s+eq\s+'([^']*)'$/i);
  if (!match) return undefined;
  return match[1].trim();
}

export function emailFromScim(body = {}) {
  const emails = Array.isArray(body.emails) ? body.emails : [];
  const primary = emails.find((item) => item?.primary && item?.value) || emails.find((item) => item?.value);
  const fromEmails = primary?.value ? String(primary.value).trim().toLowerCase() : '';
  const userName = body.userName ? String(body.userName).trim().toLowerCase() : '';
  return fromEmails || userName || null;
}

export function nameFromScim(body = {}, fallbackEmail = '') {
  if (body.displayName) return String(body.displayName).trim().slice(0, 120);
  if (body.name?.formatted) return String(body.name.formatted).trim().slice(0, 120);
  const parts = [body.name?.givenName, body.name?.familyName].filter(Boolean).map((part) => String(part).trim());
  if (parts.length) return parts.join(' ').slice(0, 120);
  if (fallbackEmail) return fallbackEmail.split('@')[0].slice(0, 120);
  return 'User';
}

export function activeFromScim(body, defaultActive = true) {
  if (body == null || body.active === undefined || body.active === null) return defaultActive;
  return Boolean(body.active);
}

/** Map a Vector user + membership to a SCIM User resource. */
export function toScimUser(user, membership, { location } = {}) {
  const active = membership?.status !== 'disabled' && user.status !== 'disabled';
  const resource = {
    schemas: [USER_SCHEMA],
    id: user.id,
    externalId: user.id,
    userName: user.email,
    displayName: user.name,
    name: { formatted: user.name },
    emails: [{ value: user.email, primary: true, type: 'work' }],
    active,
    meta: {
      resourceType: 'User',
      created: user.createdAt?.toISOString?.() ?? user.createdAt,
      lastModified: user.updatedAt?.toISOString?.() ?? user.updatedAt,
      ...(location ? { location } : {}),
    },
  };
  return resource;
}

/** Map a Vector team (+ members) to a SCIM Group resource. */
export function toScimGroup(team, members = [], { location } = {}) {
  return {
    schemas: [GROUP_SCHEMA],
    id: team.id,
    externalId: team.id,
    displayName: team.name,
    members: members.map((member) => ({
      value: member.userId ?? member.id,
      ...(member.name || member.display || member.email
        ? { display: member.name || member.display || member.email }
        : {}),
    })),
    meta: {
      resourceType: 'Group',
      created: team.createdAt?.toISOString?.() ?? team.createdAt,
      lastModified: team.updatedAt?.toISOString?.() ?? team.updatedAt,
      ...(location ? { location } : {}),
    },
  };
}

/** Apply RFC 7644 PATCH ops for Groups (displayName + members). */
export function applyScimGroupPatch(current, body) {
  const next = {
    displayName: current.displayName,
    members: Array.isArray(current.members) ? [...current.members] : [],
  };
  const operations = Array.isArray(body?.Operations) ? body.Operations : [];
  for (const operation of operations) {
    const op = String(operation?.op || '')
      .trim()
      .toLowerCase();
    const path = operation?.path ? String(operation.path).trim() : '';
    const value = operation?.value;

    if (op === 'replace') {
      if (!path && value && typeof value === 'object' && !Array.isArray(value)) {
        if (value.displayName !== undefined) next.displayName = value.displayName;
        if (value.members !== undefined) next.members = Array.isArray(value.members) ? value.members : [];
        continue;
      }
      if (/^displayName$/i.test(path)) next.displayName = value;
      else if (/^members$/i.test(path)) next.members = Array.isArray(value) ? value : [];
    } else if (op === 'add') {
      if (/^members$/i.test(path) || (!path && Array.isArray(value))) {
        const additions = Array.isArray(value) ? value : value ? [value] : [];
        const existing = new Set(next.members.map((member) => member.value));
        for (const member of additions) {
          const id = member?.value || member;
          if (!id || existing.has(id)) continue;
          next.members.push(typeof member === 'object' ? member : { value: id });
          existing.add(id);
        }
      } else if (!path && value && typeof value === 'object') {
        if (value.displayName !== undefined) next.displayName = value.displayName;
        if (value.members !== undefined) next.members = Array.isArray(value.members) ? value.members : next.members;
      }
    } else if (op === 'remove') {
      const match = path.match(/^members\[value\s+eq\s+"([^"]+)"\]$/i) || path.match(/^members\[value\s+eq\s+'([^']+)'\]$/i);
      if (match) {
        const removeId = match[1];
        next.members = next.members.filter((member) => member.value !== removeId);
      } else if (/^members$/i.test(path)) {
        next.members = [];
      }
    }
  }
  return next;
}

export function toScimList(resources, { totalResults, startIndex = 1, itemsPerPage } = {}) {
  return {
    schemas: [LIST_SCHEMA],
    totalResults: totalResults ?? resources.length,
    startIndex,
    itemsPerPage: itemsPerPage ?? resources.length,
    Resources: resources,
  };
}

export function toScimError(status, detail, scimType) {
  return {
    schemas: [ERROR_SCHEMA],
    status: String(status),
    detail,
    ...(scimType ? { scimType } : {}),
  };
}

/** Apply RFC 7644 PATCH operations onto a working user draft. */
export function applyScimPatch(current, body) {
  const next = {
    userName: current.userName,
    displayName: current.displayName,
    active: current.active,
    emails: current.emails,
    name: current.name,
  };
  const operations = Array.isArray(body?.Operations) ? body.Operations : [];
  for (const operation of operations) {
    const op = String(operation?.op || '')
      .trim()
      .toLowerCase();
    const path = operation?.path ? String(operation.path).trim() : '';
    const value = operation?.value;

    if (op === 'replace' || op === 'add') {
      if (!path && value && typeof value === 'object' && !Array.isArray(value)) {
        if (value.userName !== undefined) next.userName = value.userName;
        if (value.displayName !== undefined) next.displayName = value.displayName;
        if (value.active !== undefined) next.active = value.active;
        if (value.emails !== undefined) next.emails = value.emails;
        if (value.name !== undefined) next.name = value.name;
        continue;
      }
      if (/^active$/i.test(path)) next.active = value;
      else if (/^displayName$/i.test(path)) next.displayName = value;
      else if (/^userName$/i.test(path)) next.userName = value;
      else if (/^name\.formatted$/i.test(path)) next.name = { ...(next.name || {}), formatted: value };
      else if (/^emails$/i.test(path)) next.emails = value;
      else if (/^name$/i.test(path)) next.name = value;
    } else if (op === 'remove') {
      if (/^active$/i.test(path)) next.active = false;
    }
  }
  return next;
}
