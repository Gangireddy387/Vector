import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  draftDescription,
  extractActionHints,
  extractChecklist,
  guessPriority,
  guessType,
  suggestNextAction,
  suggestSubtasks,
  summarizeMeetingMaterial,
  summarizeText,
} from '../src/modules/ai/ai.heuristics.js';

describe('AI heuristics', () => {
  it('guesses type and priority from wording', () => {
    assert.equal(guessType('Login crash on production'), 'bug');
    assert.equal(guessType('As a user I want dark mode'), 'story');
    assert.equal(guessPriority('urgent security outage'), 'highest');
    assert.equal(guessPriority('minor typo in copy'), 'low');
  });

  it('extracts checklist and comment actions for subtasks', () => {
    assert.deepEqual(extractChecklist('- [ ] Write tests\n- [ ] Ship'), ['Write tests', 'Ship']);
    const hints = extractActionHints([{ body: 'Please fix the checkout flow\n- Follow up with Priya' }]);
    assert.ok(hints.some((hint) => /checkout flow/i.test(hint)));
    assert.ok(hints.some((hint) => /Follow up with Priya/i.test(hint)));
    assert.ok(suggestSubtasks({ type: 'bug', description: '' }).includes('Reproduce the problem'));
  });

  it('drafts a bug template and richer issue summary', () => {
    const description = draftDescription('Null pointer in cart', 'bug');
    assert.match(description, /Steps to reproduce/);
    const summary = summarizeText({
      title: 'Null pointer in cart',
      description: 'Cart crashes. Fix needed.',
      comments: [{ body: 'Please add a regression test' }],
      statusName: 'In progress',
      priority: 'high',
    });
    assert.match(summary.summary, /Cart crashes/);
    assert.ok(summary.nextSteps.some((step) => /regression test/i.test(step)));
  });

  it('suggests a concrete next action from card signals', () => {
    assert.equal(suggestNextAction({ statusCategory: 'done' }).action, null);
    assert.match(
      suggestNextAction({
        statusCategory: 'todo',
        dueDate: '2020-01-01',
        today: new Date('2026-11-24'),
      }).action,
      /due date has passed/i,
    );
    assert.equal(
      suggestNextAction({ statusCategory: 'todo', assigneeId: null, dueDate: null }).kind,
      'assign',
    );
    assert.match(
      suggestNextAction({
        statusCategory: 'in_progress',
        assigneeId: 'u1',
        subtaskDone: 1,
        subtaskTotal: 3,
      }).action,
      /2 remaining/i,
    );
  });

  it('builds an extractive meeting summary without OpenAI', () => {
    const summary = summarizeMeetingMaterial({
      title: 'Launch sync',
      transcript: [{ speaker: { name: 'Ada' }, text: 'We decided to ship on Friday.' }],
      chat: [{ author: { name: 'Ada' }, body: '- Update the pricing page' }],
      updates: [],
      notes: '',
      people: [{ id: '1', name: 'Ada Lovelace' }],
    });
    assert.match(summary.text, /ship on Friday|Update the pricing/i);
    assert.ok(summary.decisions.length >= 1);
    assert.ok(summary.actionItems.length >= 1);
    assert.equal(summary.source, 'heuristic');
  });
});
