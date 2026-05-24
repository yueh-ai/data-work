# Defer S3 Version History for POC

Although the domain model allows an Upload Session to have a Version History, the POC will focus only on the current CSV for the session and will not implement S3-backed history tracking yet. This keeps the first implementation centered on proving that AI-generated CSV edits can be uploaded and reflected in the UI before adding durable storage.

**Consequences**

- The POC may replace the current CSV for a session on each upload, and losing that current CSV is acceptable.
- The API and frontend should avoid exposing version-history controls until storage is implemented.
- Future S3 work can add object-per-version storage and a manifest without changing the core Upload Session concept.
