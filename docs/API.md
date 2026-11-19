# API reference

Base URL: `/api`. JSON in and out. Successful bodies are domain objects; failures are `{ message, details? }` with the right HTTP status. Every authenticated response can include `X-Request-Id` (also logged server-side).

Route files under `backend/src/modules/*/…routes.js` are the source of truth. This page covers conventions and the **Departments & teams** surface in full; other modules are summarized with pointers.

## Auth and headers

| Header | When |
|---|---|
| `Authorization: Bearer <token>` | Session JWT from sign-in / register, **or** a personal access token `vtk_…` |
| `X-Organization-Id: <uuid>` | Optional; only honored for organizations the person actively belongs to |

Public: `POST /auth/register`, `POST /auth/login`, password-reset and invite-accept routes, `GET /auth/oauth/providers`, `GET /auth/oauth/:provider/start`, OAuth callbacks, `GET /health`.

`GET /health` → `200` when the process and database are up, otherwise `503`.

### Personal access tokens (`vtk_`)

Create/list/revoke under `GET|POST /auth/me/tokens` and `DELETE /auth/me/tokens/:tokenId` (session auth). The plaintext secret is returned **once** on create. Use it as `Authorization: Bearer vtk_…` for scripts; org scoping is the same as the app (`X-Organization-Id`). Tokens may expire; revoke stops them immediately.

### Social sign-in

`GET /auth/oauth/providers` → `{ google, microsoft }` booleans.  
`GET /auth/oauth/:provider/start?redirect=/` → `{ url }` (browser redirect). Callback finishes at `/api/auth/oauth/:provider/callback` and returns the SPA to `/login` with `oauthToken` or `mfaToken`.

### Billing (optional Stripe)

`GET /billing/status` → `{ checkoutEnabled, trialDays, portalEnabled, hasSubscription, billedSeats, minSeats, maxSeats }` (org-aware when `X-Organization-Id` is set).  
`POST /billing/checkout` (org admin) body `{ seats? }` → Checkout for Pro **per seat**, or updates quantity if already subscribed. Optional trial via `STRIPE_TRIAL_DAYS`.  
`POST /billing/seats` (org admin) body `{ seats }` → change subscription quantity (prorated).  
`POST /billing/portal` (org admin) → `{ url }` Stripe Customer Portal (card, invoices, cancel; requires an existing Stripe customer).  
Webhook: `POST /billing/stripe/webhook` (Stripe signature; raw body). Create `STRIPE_PRICE_PRO` as a licensed/per-unit price. Enable the Customer Portal in the Stripe Dashboard.

## Conventions

- **Validation:** every write (and most reads with filters) uses zod; unknown body fields are dropped; path ids are UUID-checked before they hit the database.
- **Roles:** organization admin vs member; project admin / member / viewer. Feature flags come from the org’s plan (and optional overrides).
- **Errors:** `400` validation / business rule, `401` missing/invalid token, `403` authenticated but not allowed, `404` missing or not visible in this org, `429` rate limit.

## Departments & teams

Organization admins create and edit the structure. Members only **read** the departments they head and the teams they belong to.

| Method | Path | Who | Body / notes |
|---|---|---|---|
| `GET` | `/departments` | member | Filtered list with teams, heads, leads, members, project/work counts |
| `GET` | `/departments/:departmentId/projects` | member | Projects grouped by visible teams |
| `GET` | `/teams/:teamId/work` | member | Team projects + (admins) other projects to assign |
| `POST` | `/departments` | org admin | `{ name, description?, headId? }` |
| `PATCH` | `/departments/:departmentId` | org admin | Partial of the create body |
| `DELETE` | `/departments/:departmentId` | org admin | Teams go with it; projects become unassigned |
| `POST` | `/departments/:departmentId/teams` | org admin | `{ name, description?, leadId?, memberIds? }` |
| `PATCH` | `/teams/:teamId` | org admin | Partial; may include `departmentId` to move the team |
| `DELETE` | `/teams/:teamId` | org admin | Projects become unassigned |
| `POST` | `/teams/:teamId/projects` | org admin | `{ projectId }` — assigns ownership and grants `viaTeam` membership |
| `DELETE` | `/teams/:teamId/projects/:projectId` | org admin | Clears `teamId`; keeps people as ordinary members |

Rules of thumb: department names unique per org (case-insensitive); team names unique per department; heads/leads/members must be active org members. Covered by `backend/test/departments.integration.test.js` and a case in `security.integration.test.js`.

## Other modules (pointers)

| Area | Routes live in |
|---|---|
| Auth / session | `modules/auth/auth.routes.js` — login may return `{ mfaRequired, mfaToken }`; complete with `POST /auth/login/mfa`; manage MFA via `/auth/me/mfa/*` |
| Workspace members & invitations | `modules/organizations/` |
| Projects, members, settings | `modules/projects/` |
| Issues, comments, links, bulk | `modules/issues/` |
| Board statuses, sprints, backlog | `modules/statuses/`, `modules/sprints/` |
| Search & saved filters | `modules/search/`, `modules/saved-filters/` |
| Reports | `modules/reports/` |
| Automations, templates, recurring | `modules/automations/`, `modules/templates/`, `modules/recurring-tasks/` |
| Standups | `modules/standups/` |
| Messages / channels | `modules/messages/` |
| Personal calendar | `modules/calendar/` — `GET/POST /calendar/events`, `PATCH/DELETE /calendar/events/:eventId` (plan feature `calendar`) |
| Meetings & calendar sync | `modules/meetings/`, `modules/calendar-sync/` (Google/Microsoft OAuth + meeting push/pull) |
| Notifications & push | `modules/notifications/`, `modules/push/` |
| AI | `modules/ai/` |
| Support portal | `modules/support/` |
| Plans / super-admin | `modules/plans/`, `modules/super-admin/` |

Socket.IO events (issues, presence, calls, chat) are documented alongside the modules that emit them; see [ARCHITECTURE.md](ARCHITECTURE.md).
