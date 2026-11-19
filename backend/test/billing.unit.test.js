/* Unit tests for seat clamping and billing status flags. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { billingStatus, normalizeSeats, seatBounds } from '../src/modules/billing/billing.service.js';

describe('normalizeSeats', () => {
  const { minSeats, maxSeats } = seatBounds();

  it('clamps invalid input to the membership floor', () => {
    assert.equal(normalizeSeats(undefined, { currentMembers: 3 }), Math.max(minSeats, 3));
    assert.equal(normalizeSeats('nope', { currentMembers: 1 }), Math.max(minSeats, 1));
  });

  it('rejects quantities below current members or above the self-serve cap', () => {
    assert.throws(() => normalizeSeats(1, { currentMembers: 4 }), (error) => error.status === 400);
    assert.throws(() => normalizeSeats(maxSeats + 1, { currentMembers: 1 }), (error) => error.status === 400);
  });

  it('accepts a quantity within bounds', () => {
    const seats = Math.min(maxSeats, Math.max(minSeats, 5));
    assert.equal(normalizeSeats(seats, { currentMembers: 1 }), seats);
  });
});

describe('billingStatus', () => {
  it('reports portal and subscription from the organization record', () => {
    const empty = billingStatus(null);
    assert.equal(empty.hasSubscription, false);
    assert.equal(empty.portalEnabled, false);
    assert.equal(empty.billedSeats, null);
    assert.ok(empty.minSeats >= 1);
    assert.ok(empty.maxSeats >= empty.minSeats);

    const withCustomer = billingStatus({
      stripeCustomerId: 'cus_test',
      stripeSubscriptionId: 'sub_test',
      billedSeats: 8,
    });
    assert.equal(withCustomer.hasSubscription, true);
    assert.equal(withCustomer.billedSeats, 8);
    assert.equal(withCustomer.portalEnabled, withCustomer.checkoutEnabled);

    assert.equal(billingStatus({ stripeCustomerId: null, stripeSubscriptionId: null }).portalEnabled, false);
  });
});
