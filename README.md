# CSV Data Work POC

Hosted Companion Website POC for AI-assisted CSV data work. The Companion Website creates anonymous Upload Sessions, relays agent Working CSV previews to active viewers, and temporarily holds UI-origin handoffs so the agent can import them.

The website is preview-only. CSV transformations happen in the Python Workspace with reproducible code, and the backend does not own the latest Working CSV Version.

## Run Locally

```sh
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

For an agent-first session, create the Upload Session with `POST /api/sessions` and use the returned Viewer URL and agent-facing URLs. If a user already created the session in the browser, use the session ID at the end of the shared `/session/:sessionId` Viewer URL to derive the endpoints below. The Viewer page intentionally does not display agent URLs, tokens, or shell commands.

Upload an agent Working CSV Version:

```sh
COMPANION_WEBSITE_ORIGIN="${COMPANION_WEBSITE_ORIGIN:-http://localhost:3000}"
SESSION_ID="${SESSION_ID:?Set SESSION_ID from the session response or Viewer URL}"

curl -X PUT \
  -H 'Content-Type: text/csv' \
  --data-binary @working.csv \
  "$COMPANION_WEBSITE_ORIGIN/api/sessions/$SESSION_ID/working"
```

Download a pending UI handoff CSV into the agent workspace:

```sh
COMPANION_WEBSITE_ORIGIN="${COMPANION_WEBSITE_ORIGIN:-http://localhost:3000}"
SESSION_ID="${SESSION_ID:?Set SESSION_ID from the session response or Viewer URL}"

curl -f -o source.csv \
  "$COMPANION_WEBSITE_ORIGIN/api/sessions/$SESSION_ID/handoff/csv"
```

Confirm handoff import after the agent has saved and verified the file:

```sh
COMPANION_WEBSITE_ORIGIN="${COMPANION_WEBSITE_ORIGIN:-http://localhost:3000}"
SESSION_ID="${SESSION_ID:?Set SESSION_ID from the session response or Viewer URL}"

curl -X POST \
  "$COMPANION_WEBSITE_ORIGIN/api/sessions/$SESSION_ID/handoff/confirm"
```

## Build

```sh
npm run build
npm run start
```

Set `PORT` to change the listen port:

```sh
PORT=8080 npm run start
```

## POC Shape

- The backend is TypeScript/Express.
- Upload Sessions are anonymous.
- The Upload Token is a POC placeholder and is not enforced by the backend.
- Browser source uploads use `PUT /api/sessions/:sessionId/handoff`.
- Agents import pending UI handoffs with `GET /api/sessions/:sessionId/handoff/csv`.
- Agents confirm handoff import with `POST /api/sessions/:sessionId/handoff/confirm`.
- Agent Working CSV previews use `PUT /api/sessions/:sessionId/working`.
- Viewer updates use Server-Sent Events from `GET /api/sessions/:sessionId/events`.
- The browser parses CSV text and holds the current table data.
- The backend stores only pending UI handoff CSVs for up to 30 minutes.
- The backend does not store the latest agent Working CSV Version.
- S3, databases, Version History, pagination, and virtualization are intentionally deferred.
