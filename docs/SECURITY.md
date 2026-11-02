# Vector — security model

How Vector protects accounts and keeps each organization's data to itself, and what to check when changing code.
Report a suspected vulnerability privately to the development team; do not open a public issue.

## Accounts and sign-in

| Topic | How it works | Where |
|---|---|---|
| Passwords | bcrypt with cost 12; older hashes are upgraded at the next sign-in | `backend/src/modules/auth/auth.service.js` |
| Wrong passwords | Same answer and timing for an unknown email and a wrong password; at most 10 failed tries per account and 50 credential requests per address per 15 minutes | `auth.service.js`, `auth.routes.js` |
| Tokens | Signed JWTs with a purpose (`typ`: access, guest, recording). Only sign-in tokens open the API and live connections; guest passes only open their one meeting; recording links only stream their one file | `backend/src/modules/auth/token.js` |
| Revocation | Changing or resetting a password raises the account's `tokenVersion`; every older token (all other devices) stops working at once, for HTTP and sockets | `token.js`, `shared/middleware/authenticate.js`, `shared/realtime/socket.js` |
| Invitations | An invited email can only be claimed through the emailed invitation link (it proves the mailbox), never by signing up | `auth.service.js` (`register`) |
| Super admin | Created from `SUPER_ADMIN_*` on startup; its email cannot be registered by anyone else | `super-admin.service.js`, `auth.service.js` |
| Signing secret | Production refuses to start with a short or published `JWT_SECRET` | `backend/src/config/index.js` |

## Organization isolation

Every organization's work is visible only to its active members:

- **Projects:** access to a project (and everything in it: tasks, comments, attachments, links, chat, live events, notifications, the daily digest) requires being an **active member of the organization that owns it**, checked on every request (`projectRoleOf` in `modules/projects/project-access.js`). Deactivating or removing someone ends their access at once, also from their other organizations, and their open tabs leave the organization's live rooms immediately.
- **Organization header:** `X-Organization-Id` is honoured only for organizations the person actively belongs to; anything else falls back to their own organization.
- **Adding people:** project admins can add people who are already in the organization; bringing someone new into the organization stays with organization admins.
- **Links between tasks** stay inside one organization.
- **Removed members** stop following the organization's tasks (watchers are removed) and receive no further notifications about them.
- **Meetings:** only the host, invited people and organization admins open a meeting; guests come with a pass for one meeting and wait in a lobby until someone lets them in.

Tested by `backend/test/security.integration.test.js` against a real server (`npm test` in `backend`).

## Requests and files

- **Validation:** every write endpoint validates its body with zod (unknown fields are dropped); ids from URLs and socket messages are checked before they reach the database.
- **Uploads:** images are checked by their bytes; attachments are served as downloads, and types a browser could run (HTML, SVG, XML, scripts) always as plain files; paths cannot leave the uploads folder. Call recordings are checked (meeting, recording, uploader) before any byte is written.
- **Markdown** (descriptions, comments, chat) is sanitized with DOMPurify; links opening a new tab get `rel="noopener noreferrer"`.
- **Server-side requests** only go to configured services (SendGrid, OpenAI, TURN, LiveKit) and to the browsers' own push services; push subscriptions to any other address are refused.
- **Headers:** the API sends a strict CSP, HSTS (production), `nosniff` and no framing; the app's headers are set in Nginx (`docs/DEPLOYMENT.md` §8.1). CORS only allows the configured app origins and sends no credentials (sign-in is a bearer token, so there is no CSRF exposure).
- **Errors** never include internal details; clients get a `requestId` to quote, the logs have the full error.
- **Logs** never contain secrets from addresses (guest passes, recording links and reset tokens are redacted).
- **Meeting files** (call chat): only invited members of the meeting's organization upload, and only the uploader can attach a file to a message. Links are signed for one file (`typ: 'file'`, 2 hours) and handed out only to people in the call or invited to the meeting; images show inline, everything else downloads, and active types are always plain files.
- **Calendar sync:** OAuth `state` is a signed, 10-minute token for one person and provider (`typ: 'oauth'`); the callback refuses anything else. Access and refresh tokens are stored encrypted (AES-256-GCM, `CALENDAR_TOKEN_KEY` or a key derived from `JWT_SECRET`) and never sent to browsers; a refused refresh marks the connection for reconnecting.
- **LiveKit webhook** (phone attendance) is only accepted with LiveKit's signature over the exact body (`WebhookReceiver`); phone callers can only be muted or removed by the host or a co-host of that call.
- **Attendance reports** (names, emails, times) are only for the host and organization admins.

## Live connections (Socket.IO)

- Connecting requires an active account and a current sign-in token (or a guest pass for one meeting).
- Rooms: a person's own room, their organizations' rooms (presence), and project rooms only after the same access check as the API.
- Every event handler is guarded: a malformed or hostile message is logged and answered with an error; it can never stop the server.
- Rates are limited per connection for chat, reactions and captions.

## Browser storage

- The sign-in token is kept in `localStorage` (one per tab type: normal and super admin). The strict CSP (no inline or third-party scripts) is what keeps it out of reach of injected code.
- API answers are **not** cached by the service worker; signing out clears the app's caches.

## Checklist for changes

1. New endpoint: validate the body with zod; load records through the module's access helper (`assertProjectRole`, `loadIssueWithAccess`, `loadMeeting`…), never by id alone.
2. New socket event: check the sender's place first (`currentCall`, `canWatchProject`…); never trust ids or sizes in the payload.
3. New background job: claim each piece of work with a conditional update so two servers never both do it.
4. New notification about project work: pass `projectId` so only people with access receive it.
5. Add a case to `backend/test/security.integration.test.js` for any new access rule.
