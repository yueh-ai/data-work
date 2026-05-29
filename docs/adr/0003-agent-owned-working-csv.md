# Agent-Owned Working CSV Versions

The Companion Website backend is a bridge, not the owner of current working data. Agent Working CSV Versions live in the Python Workspace. Working uploads are validated, relayed to connected viewers, and discarded by the backend after the request.

UI-origin source files are the exception: the backend may normalize a browser upload with `_row_id` and keep it as a Pending Handoff CSV for 30 minutes so the agent can import it. Agent confirmation deletes the handoff immediately.

**Consequences**

- Browser refresh cannot restore the latest agent Working CSV Version from the backend.
- The recovery path is for the agent to upload the current local Working CSV Version again.
- Backend memory may contain pending UI handoff CSVs, but not ongoing agent working data.
- Version history remains deferred.
