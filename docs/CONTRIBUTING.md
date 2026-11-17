# Contributing to Vector

Short guide for working on the app locally and landing a change safely.

## Prerequisites

- Node.js 20+ (22 is fine)
- Optional: PostgreSQL if you prefer it over the default SQLite file

## First run

```bash
npm run install:all
cp backend/.env.example backend/.env
# set SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD / SUPER_ADMIN_NAME
npm run db:seed
npm run dev:backend          # http://localhost:4000/api
npm run dev:frontend         # http://localhost:5173
```

Sign up in the app, approve the organization as the super admin, then invite people.

## Checks before you open a PR

```bash
npm --prefix backend run lint && npm --prefix backend test
npm --prefix frontend run lint && npm --prefix frontend test
npm --prefix frontend run build
```

CI runs the same set (`.github/workflows/ci.yml`). Prefer a throwaway SQLite DB for tests (the default); do not point tests at a shared production database.

## How a feature is laid out

**Backend** — one folder under `backend/src/modules/<name>/`:

| File | Role |
|---|---|
| `<name>.model.js` | Sequelize model |
| `<name>.validation.js` | Zod schemas for body / query / params |
| `<name>.routes.js` | Express routes + `validate(...)` |
| `<name>.controller.js` | Thin handlers (optional when routes stay short) |
| `<name>.service.js` | Business rules and access checks |

Register the router in `backend/src/routes.js` and associations in `backend/src/database/models.js`. Additive schema changes go in `backend/src/database/upgrades.js`.

**Frontend** — one folder under `frontend/src/modules/<name>/` with `<name>.api.ts`, `<name>.routes.ts`, `pages/`, `components/`, and an optional store. Import routes from `frontend/src/router/index.ts`.

## Adding an integration test

Mirror `backend/test/standups.integration.test.js` or `backend/test/departments.integration.test.js`:

1. Start an isolated server with `startIsolatedServer` from `test/helpers/isolated-server.js`.
2. Register / approve / seed only what the case needs.
3. Assert status codes and a few response fields.
4. Add the file to both `"test"` and `"test:integration"` in `backend/package.json`.

Access-control changes also need a case in `backend/test/security.integration.test.js` (see the checklist in [SECURITY.md](SECURITY.md)).

## API and architecture

- Endpoint conventions: [API.md](API.md)
- How the pieces fit: [ARCHITECTURE.md](ARCHITECTURE.md)
- Isolation and change checklist: [SECURITY.md](SECURITY.md)
- Production setup: [DEPLOYMENT.md](DEPLOYMENT.md)
