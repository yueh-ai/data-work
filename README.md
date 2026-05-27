# CSV Data Work POC

Hosted Companion Website POC for AI-assisted CSV data work. The Companion Website creates anonymous Upload Sessions, accepts CSV uploads from an Agent Website, exposes the latest CSV for download, and updates the active viewer with the latest Working CSV Version.

The website is preview-only. CSV transformations happen in the Python Workspace with reproducible code.

## Run Locally

```sh
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Create a new Upload Session, then upload a CSV with the generated command:

```sh
curl -X PUT \
  -H 'Content-Type: text/csv' \
  --data-binary @working.csv \
  http://localhost:3000/api/sessions/<SESSION_ID>/upload
```

Download the latest Working CSV Version for a session:

```sh
curl -o working.csv \
  http://localhost:3000/api/sessions/<SESSION_ID>/csv
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
- Uploads use `PUT /api/sessions/:sessionId/upload`.
- Downloads use `GET /api/sessions/:sessionId/csv` for the latest Working CSV Version.
- Viewer updates use Server-Sent Events from `GET /api/sessions/:sessionId/events`.
- The browser parses CSV text and holds the current table data.
- Backend memory is transient and not durable storage.
- S3, databases, Version History, pagination, and virtualization are intentionally deferred.
