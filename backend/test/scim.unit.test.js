/*
 * SCIM mapper helpers (filter, name/email extraction, PATCH) — no database.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  activeFromScim,
  applyScimPatch,
  emailFromScim,
  nameFromScim,
  parseUserNameFilter,
  toScimUser,
} from '../src/modules/scim/scim.mapper.js';

describe('scim.mapper', () => {
  it('parses userName eq filters', () => {
    assert.equal(parseUserNameFilter('userName eq "Ada@Acme.COM"'), 'ada@acme.com');
    assert.equal(parseUserNameFilter("userName eq 'bob@x.io'"), 'bob@x.io');
    assert.equal(parseUserNameFilter(null), null);
    assert.equal(parseUserNameFilter('emails eq "x"'), undefined);
  });

  it('extracts email and display name from SCIM bodies', () => {
    assert.equal(emailFromScim({ userName: 'Ada@Acme.com' }), 'ada@acme.com');
    assert.equal(
      emailFromScim({ emails: [{ value: 'a@x.com' }, { value: 'b@x.com', primary: true }] }),
      'b@x.com',
    );
    assert.equal(nameFromScim({ displayName: 'Ada Lovelace' }), 'Ada Lovelace');
    assert.equal(nameFromScim({ name: { givenName: 'Ada', familyName: 'Lovelace' } }), 'Ada Lovelace');
    assert.equal(nameFromScim({}, 'ada@acme.com'), 'ada');
    assert.equal(activeFromScim({ active: false }), false);
    assert.equal(activeFromScim({}), true);
  });

  it('maps users and applies PATCH ops', () => {
    const resource = toScimUser(
      { id: 'u1', email: 'ada@acme.com', name: 'Ada', status: 'active', createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-02') },
      { status: 'active' },
      { location: 'https://api.example/scim/v2/Users/u1' },
    );
    assert.equal(resource.userName, 'ada@acme.com');
    assert.equal(resource.active, true);
    assert.equal(resource.meta.location, 'https://api.example/scim/v2/Users/u1');

    const patched = applyScimPatch(resource, {
      Operations: [
        { op: 'Replace', path: 'displayName', value: 'Ada L.' },
        { op: 'replace', path: 'active', value: false },
      ],
    });
    assert.equal(patched.displayName, 'Ada L.');
    assert.equal(patched.active, false);
  });
});
