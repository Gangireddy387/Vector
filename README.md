# Vector

A Jira-style work management app focused on **removing manual work**: automation rules, recurring tasks, issue templates, natural-language quick add, smart auto-assignment and an AI assistant.

- **Frontend:** Vue 3 + TypeScript, Vite, Tailwind CSS v4 (design tokens), shadcn-vue components (reka-ui), Pinia, Vue Router, PWA
- **Backend:** Node.js (Express 5), Sequelize ORM (SQLite by default, PostgreSQL ready), Socket.IO, node-cron, SendGrid, OpenAI

## Quick start

Requirements: Node.js 20+ (tested on 22).

```bash
npm run install:all          # installs backend and frontend
cp backend/.env.example backend/.env
npm run db:seed              # tables, default plans and the super admin (keeps existing data)
npm run dev:backend          # API on http://localhost:4000/api
npm run dev:frontend         # app on http://localhost:5173 (second terminal)
```

There is no sample data. Set `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` and `SUPER_ADMIN_NAME` in `backend/.env` first; the super admin account is created (or updated) by `db:seed` and on every server start. Then sign up in the app, create your organization, approve it as the super admin, and invite your people.

## Adding your keys later

Everything works without keys: emails are printed to the backend console and the AI assistant uses built-in heuristics. Add keys to `backend/.env` and restart the backend:

| Variable | Purpose |
| --- | --- |
| `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME` | Invitations, password resets, notifications, reminders, daily digest. The sender must be verified in SendGrid. |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | AI issue drafts, issue summaries, sub-task breakdowns. Default model `gpt-4o-mini`. |
| `JWT_SECRET` | Required in production (long random string). |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | PostgreSQL connection (the database is created automatically if missing). `DATABASE_URL` overrides these; removing `DB_NAME` falls back to SQLite. |

`GET /api/health` shows whether email and AI are enabled.

## Features

**Planning & tracking**
- Projects (Scrum or Kanban) with members and roles (admin / member / viewer), invitations by email
- Issues: epics, stories, tasks, bugs, sub-tasks; priority, story points, estimates, start/due dates, labels, watchers, links (blocks / relates / duplicates)
- Configurable workflow statuses with categories and WIP limits
- Board with drag & drop, backlog with sprint planning, start/complete sprint with automatic carry-over
- Comments with @mentions, attachments (drag & drop upload), work logs and time tracking, full history
- Global search, saved filter views, bulk edit, URL-synced filters
- Reports: created vs. resolved, status/priority/type breakdown, team workload, cycle time, sprint burndown, velocity
- Inbox with real-time notifications (Socket.IO), email notifications, daily digest

**Less manual work**
- **Automation rules** — *When* (created, status/assignee/priority changed, commented, due soon) *If* (conditions) *Then* (assign, change status, set priority, add/remove labels, comment, notify, email, set due date/points, move to active sprint, create sub-tasks). Nine one-click recipes. Loop protection and run history.
- **Smart defaults** per project — auto-assign (round robin, least busy, lead, default person), close parents when all sub-tasks are done, carry over unfinished sprint work, due-date reminders.
- **Recurring tasks** — daily, weekdays, weekly or monthly issues created on schedule, with "Run now".
- **Templates** — pre-fill type, priority, description, labels and sub-tasks.
- **Quick add** — `Fix login @priya #backend !high ^fri ~3 /bug` fills assignee, label, priority, due date, points and type in one line, anywhere.
- **AI assistant** — draft a full issue from a title, summarize long threads, break work into sub-tasks.
- Keyboard-first desktop: `Ctrl K` / `/` jump to the top-bar search (results open right below it), `C` create, `G H / G I / G P / G B / G L` navigation, `?` shortcuts.

**Workspace administration & appearance**
- Organization **admin** role (the organization's creator, plus anyone they promote). Admins open **Organization** and **Departments** in the sidebar.
- **Light and dark mode** (plus "System"), each person chooses in Settings → Appearance or the account menu; the admin sets the default for first-time visitors and the workspace name.
- People management: promote/demote workspace admins, deactivate/reactivate accounts.
- Colours are design tokens in `frontend/src/assets/styles/main.css` (`:root` for light, `.dark` for dark); every surface derives from one tint, so a future theme only needs a new tint, primary and brand gradient.

**Device-specific experience** (not a shrunken desktop)
- **Desktop (≥1024px):** collapsible sidebar, inline top-bar search, dense dashboard (stats, grouped work, sprint progress, activity, project health), multi-column drag & drop board, issue side panel with all fields visible.
- **Mobile:** bottom tab bar with a central create button, "My tasks" view (Today / Upcoming / Anytime / Done) with one-tap completion and undo, one-status-at-a-time board with "Move to" buttons, full-screen issue page with Status / Mark done / Assign to me first, bottom-sheet forms, safe-area aware.
- **PWA:** installable, offline-cached app shell, cached API reads, home-screen shortcuts (My tasks, Create issue, Inbox).

## Project structure

```
backend/src
├── config/            environment configuration
├── database/          connection, model registry + associations (models.js), sync, seed
├── events/            domain-event listener registration
├── jobs/              scheduler (recurring tasks, due reminders, daily digest)
├── shared/            errors, middleware (auth, validation, errors), realtime, email, utils
└── modules/<name>/    one folder per feature:
    <name>.model.js · <name>.routes.js · <name>.controller.js · <name>.service.js · <name>.validation.js
    activity · ai · attachments · auth · automations · comments · dashboard · issues · labels
    notifications · projects · recurring-tasks · reports · saved-filters · search · sprints
    statuses · templates · users · worklogs

frontend/src
├── components/ui/     shadcn-vue primitives (button, dialog, sheet, select, …)
├── components/common/ reusable domain-agnostic pieces (UserAvatar, StatusBadge, EmptyState, charts, …)
├── components/layout/ DesktopShell, MobileShell, sidebar, tab bar, global search
├── composables/       useDevice, useProjectRealtime, useHotkeys, useConfirm, useTheme, usePwaInstall
├── lib/               http client, realtime socket, formatting, markdown, quick-add parser
├── layouts/           AppShell (picks desktop or mobile shell), AuthLayout
├── router/            aggregates each module's routes + guards
├── stores/            global UI store
├── types/             API models
└── modules/<name>/    <name>.api.ts · <name>.store.ts · <name>.routes.ts · pages/ · components/ · composables/
    auth · automation · backlog · board · dashboard · issues · notifications · projects
    reports · search · settings · sprints
```

### How the backend fits together

- **Models** live in their module; `database/models.js` imports them all and declares every association in one place, so the whole data model can be reviewed in a single file.
- **Services** hold business rules; controllers stay thin; zod schemas validate every request.
- **Domain events** (`shared/events/event-bus.js`) decouple side effects: issue and comment changes publish events that the automation engine, notifications, realtime broadcasts and parent auto-closing subscribe to.
- **Automation engine** (`modules/automations/automation.engine.js`) evaluates conditions and runs actions with an increasing depth counter, so rules cannot loop forever.
- **Ordering** uses a fractional `position` rank shared by board columns and the backlog, so a drag only updates one row.

## Database

PostgreSQL is configured in `backend/.env`:

```env
DB_NAME=vector
DB_USER=postgres
DB_PASSWORD=root
DB_HOST=localhost
DB_PORT=5432
```

The database is created on first start if it does not exist, and tables are created automatically (`DB_AUTO_SYNC=true`).

```bash
npm --prefix backend run db:sync     # create missing tables
npm --prefix backend run db:reset    # drop and recreate all tables (data loss)
npm run db:seed                      # default plans and super admin; never deletes data
```

For production schema changes, add Sequelize migrations and set `DB_AUTO_SYNC=false`.

## Production

```bash
npm run build                        # frontend → frontend/dist (static files + service worker)
NODE_ENV=production npm --prefix backend start
```

Serve `frontend/dist` from any static host or CDN and proxy `/api` and `/socket.io` to the backend (or set `VITE_API_URL` / `VITE_SOCKET_URL` at build time and `CLIENT_URL` on the backend for CORS and email links).

### Before you deploy
- **Legal pages** — `/privacy` and `/terms` are public and linked from sign-in, registration and invitations. Set `VITE_LEGAL_COMPANY_NAME`, `VITE_LEGAL_CONTACT_EMAIL`, `VITE_LEGAL_POSTAL_ADDRESS`, `VITE_LEGAL_JURISDICTION` and `VITE_LEGAL_EFFECTIVE_DATE` in `frontend/.env` (see `.env.example`) before building, and have the text (`frontend/src/modules/legal/pages`) reviewed for your jurisdiction.
- **Secrets** — set a long random `JWT_SECRET`, real database credentials, and `SENDGRID_*` / `OPENAI_API_KEY` if you use email and AI.
- **HTTPS** — serve the app over HTTPS (required for installing the PWA and assumed by the privacy policy).
