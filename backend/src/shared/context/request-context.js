import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request context (the signed-in user's current organization), available to any code running for that
 * request without threading it through every call. Background jobs run outside a request and see no organization.
 */
const storage = new AsyncLocalStorage();

export const runWithContext = (context, callback) => storage.run(context, callback);

export const currentOrganizationId = () => storage.getStore()?.organizationId ?? null;

export const currentOrganizationRole = () => storage.getStore()?.organizationRole ?? null;
