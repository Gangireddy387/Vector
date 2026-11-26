import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canViewChatMessage } from '../src/modules/chat/chat.service.js';

describe('private standup draft visibility', () => {
  const draft = {
    kind: 'bot',
    meta: { type: 'standup_draft', private: true, forUserId: 'user-a', requestedBy: { id: 'user-a', name: 'A' } },
  };
  const privateCommand = {
    kind: 'user',
    authorId: 'user-a',
    body: '/standup',
    meta: { private: true, forUserId: 'user-a', type: 'assistant_request', command: 'standup' },
  };
  const publicHelp = {
    kind: 'bot',
    meta: { type: 'help', commands: [] },
  };

  it('hides private drafts from other members', () => {
    assert.equal(canViewChatMessage(draft, 'user-b'), false);
    assert.equal(canViewChatMessage(draft, null), false);
  });

  it('shows private drafts to the requester', () => {
    assert.equal(canViewChatMessage(draft, 'user-a'), true);
  });

  it('hides the bare /standup command from other members', () => {
    assert.equal(canViewChatMessage(privateCommand, 'user-b'), false);
    assert.equal(canViewChatMessage(privateCommand, 'user-a'), true);
  });

  it('keeps normal bot replies and public chat visible to everyone', () => {
    assert.equal(canViewChatMessage(publicHelp, 'user-b'), true);
    assert.equal(canViewChatMessage({ kind: 'user', body: 'hello team' }, 'user-b'), true);
  });
});
