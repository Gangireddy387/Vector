# Vector — architecture

A tour of how the pieces fit, for people changing the code. Setup is in the [README](../README.md), servers in
[DEPLOYMENT.md](DEPLOYMENT.md), the security model in [SECURITY.md](SECURITY.md).

## Overview

```
Browser (Vue 3 SPA, PWA)
  │  HTTPS /api  (REST, bearer token, X-Organization-Id)
  │  WSS  /socket.io (live events, presence, calls)
  ▼
Nginx ──► Node.js backend (Express 5 + Socket.IO)
              ├─ PostgreSQL (SQLite for development and tests)
              ├─ uploads folder (attachments, logos, avatars, call recordings)
              ├─ Redis (optional: several servers, calls survive restarts)
              ├─ LiveKit (optional: large calls), coturn (TURN relay for calls)
              └─ SendGrid, OpenAI, Web Push (optional integrations)
```

## Backend (`backend/src`)

| Folder | Role |
|---|---|
| `config/` | Every setting from the environment, with safe defaults and production checks |
| `database/` | Connection, `models.js` (all associations in one place), additive upgrades and indexes run at startup |
| `modules/<feature>/` | `routes` → `controller` (or inline handlers) → `service` → `model`, plus `validation` (zod) |
| `shared/` | Errors, middleware (auth, validation, errors), realtime (sockets, presence, shared state), logger, email, utils |
| `events/`, `shared/events/` | Domain events: issue and comment changes publish events that automations, notifications and live updates subscribe to |
| `jobs/` | Scheduled work (recurring tasks, reminders, digests, meetings); each run claims its work, so several servers are safe |

**A request:** `app.js` gives it an id (logs, `X-Request-Id`) → rate limit → `authenticate` (token type, account active,
token not revoked, current organization) → `requireOrganization` → route validation (zod) → service (access checks,
business rules, transactions for multi-step writes) → JSON. Errors become `{ message, details? }` with the right status;
unexpected ones are logged with the request id and answered generically.

**Organizations:** every record belongs to an organization, directly or through its project. Access to a project goes
through `modules/projects/project-access.js` (`projectRoleOf`), which also requires an active membership of the
project's organization. See [SECURITY.md](SECURITY.md).

**Transactions:** multi-step writes run in `writeTransaction` (`database/connection.js`). Task numbers come from the
project's counter under a row lock, backed by a unique `(project_id, number)` index.

**Live updates:** services publish domain events; `shared/realtime/realtime.listener.js` turns them into small socket
signals (`issue:changed` with `projectId`…), and clients reload what they show. Presence (`shared/realtime/presence.js`)
and call state live in `shared/realtime/shared-state.js`: Redis when `REDIS_URL` is set, memory otherwise.

**Meetings (`modules/meetings`):** REST in `meeting.routes.js` / `meeting.service.js`; the live call runs over the
socket. Each file owns one part of a call:

| File | Part |
|---|---|
| `meeting.signaling.js` | Joining, the lobby (guests only, or everyone), media, host controls, chat, breakout rooms and their timer |
| `meeting.collab.js` | Polls and the whiteboard (freehand strokes, shapes, text, sticky notes; checked by `cleanBoardItem`) |
| `meeting.qa.js` | Q&A: ask, upvote, mark answered, remove |
| `meeting.files.js` | Files shared in the chat: upload (members), short-lived signed links (everyone in the call, guests too) |
| `meeting.attendance.js` | One row per stay in a call; the report merges overlapping stays per person |
| `meeting.media.js`, `meeting.phone.js` | LiveKit (optional): media passes, host enforcement; phone dial-in with a PIN per meeting, webhook attendance |
| `modules/calendar-sync/` | Google / Microsoft calendar sync: OAuth, encrypted tokens, push on change, a 5-minute job pulls moves and RSVPs |

On the client, `useMeetingCall.ts` is the one call of the tab; `call/` holds the transports (direct, LiveKit),
keyboard shortcuts and tiles; `components/Call*.vue` are the panels.

**Schema changes:** new tables come from `sequelize.sync()`; new columns are listed in `database/upgrades.js`
(`ADDED_COLUMNS`) and new indexes in `INDEXES`, all idempotent and applied at startup. Keep changes additive.

## Frontend (`frontend/src`)

| Folder | Role |
|---|---|
| `modules/<feature>/` | `<feature>.api.ts` (HTTP), `<feature>.routes.ts`, `pages/`, `components/`, optional store and composables |
| `components/ui` | shadcn-vue primitives; `components/common`, `components/layout`, `components/forms` are shared app parts |
| `lib/` | HTTP client, socket connection (`realtime.ts`), `socket-events.ts`, markdown, `latest.ts`, presence looks |
| `stores/`, `modules/*/…store.ts` | Pinia stores for session-wide state (auth, projects, notifications, messages, presence…) |
| `composables/` | `useProjectRealtime`, `useConfirm`, `useHotkeys`, `useDevice`, `useTheme`… |

**Live events:** components listen with `useSocketEvents(...)` (stores with `bindSocketEvents`). Both keep listening when
the app's connection is replaced (signing in again, after a guest call) and run `onConnect` after every reconnection
(to reload what may have been missed). Project rooms are reference-counted in `useProjectRealtime`, so the board and the
task panel over it can follow the same project, and rooms are rejoined after reconnecting.

**Loading data:** pages show skeletons while loading, a "did not load — Try again" state on failure, and "not found"
only when the server says so (`isNotFoundError`). Requests that can overlap (search, filters, switching projects) use
`latestRequest()` so a late answer never replaces a newer one.

**Calls:** `modules/meetings/useMeetingCall.ts` is the one call of a tab (it outlives pages); media goes browser to
browser, or through LiveKit (`call/sfu.ts`, loaded only when used). The call layer is loaded lazily from `App.vue`.

## Quality checks

| Command | What |
|---|---|
| `npm --prefix backend run lint` / `npm --prefix frontend run lint` | ESLint (backend JS; frontend Vue + TypeScript) |
| `npm --prefix backend test` | Unit tests and security/isolation integration tests on a throwaway database |
| `npm --prefix frontend test` | Vitest unit tests (realtime binding, rooms, markdown sanitizing, confirm queue…) |
| `npm --prefix frontend run build` | Type-check (`vue-tsc`) and production build |
| `npm --prefix backend run test:meetings` / `test:presence` | Live checks against a running dev server |

All of them except the live checks run in CI on every push (`.github/workflows/ci.yml`).
