# POC Hosted CSV Preview Architecture

For the POC, the Companion Website uses a TypeScript backend as a transient session and upload coordinator, while the active browser holds the current parsed table data and renders it as a spreadsheet-like table. This deliberately avoids S3, databases, backend dataframe memory, backend preview artifact storage, streaming preview, pagination, and cell-based preview caps until the core hosted workflow is proven; file-size and shape limits are operator-trusted guardrails rather than scale guarantees.

**Consequences**

- The backend should not be treated as durable storage; losing current session data is acceptable.
- The active frontend may lose the current table data on refresh or disconnect.
- POC users are expected to avoid CSVs that are too large for their browser to parse and render comfortably.
- Production follow-up may need virtualized rows, paginated preview, sampled preview, or server-generated preview artifacts.
