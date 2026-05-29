# CSV Data Work

This context describes an AI-assisted workflow for transforming CSV files with code while showing the user an up-to-date hosted visual preview.

## Language

**Agent Website**:
The separate web application where the user chats with an AI agent that can run Python code in a sandboxed workspace.
_Avoid_: Companion website, preview website

**Companion Website**:
A hosted website that displays the current CSV state for visual inspection during the data work loop. It is a preview surface, not the place where CSV transformations happen.
_Avoid_: Local website, editor, transformation app

**Python Workspace**:
The sandboxed execution environment used by the AI agent to inspect CSV files and produce transformed CSV outputs with reproducible Python code.
_Avoid_: Website backend, manual editor

**Working CSV Version**:
The latest transformed CSV file produced by code in the Python Workspace. It is distinct from the original CSV, which remains unchanged by default.
_Avoid_: Original file, uploaded file

**Pending Handoff CSV**:
A UI-uploaded CSV normalized with `_row_id` and held briefly by the Companion Website so the agent can import it into the Python Workspace. It expires after 30 minutes by default or disappears immediately after agent confirmation.
_Avoid_: Working CSV Version, backend source of truth, durable storage

**Current Table Data**:
The parsed rows, columns, and lightweight metadata currently displayed by the Companion Website in the active browser. It can be produced from a pending handoff preview or an agent working preview. In the POC, it can live only in the active browser and does not need to be durable.
_Avoid_: Durable CSV, source of truth, Version History

**CSV Version**:
A durable CSV file state retained at a specific point in the data work loop. Version History can retain many CSV Versions for one Upload Session, but this is deferred beyond the current POC.
_Avoid_: Preview, cache entry, dataframe

**Version History**:
The ordered set of durable CSV Versions retained for an Upload Session so the user can return to earlier states. This remains a deferred domain concept in the current POC.
_Avoid_: Audit log, backend memory, browser state

**Upload Session**:
A temporary anonymous workspace on the Companion Website that groups the CSV versions shown to one user during one data work loop.
_Avoid_: Project, dataset, account

**Upload Token**:
A short-lived credential that allows the Agent Website to send Working CSV Versions into a specific Upload Session.
_Avoid_: API key, password, login

**Viewer URL**:
A session-specific Companion Website URL that lets the user inspect the CSV versions in an Upload Session.
_Avoid_: Login, dashboard, account page

## Example Dialogue

Developer: "The Agent Website creates a new Working CSV Version in the Python Workspace."

Domain expert: "Then the Companion Website should display that Working CSV Version, but it should not transform the data itself."

Developer: "So the Companion Website is hosted and preview-only, while Python remains the source of truth for data changes."

Domain expert: "In the full product, each saved checkpoint may become a CSV Version in the Upload Session's Version History."

Developer: "For the POC, do we need to store every CSV Version?"

Domain expert: "No. The active browser can hold Current Table Data so we can prove the AI edit-and-preview loop before adding durable Version History."

Domain expert: "If the user uploads the starting CSV through the UI, the Companion Website may hold that Pending Handoff CSV for 30 minutes so the agent can import it, but it must not keep agent Working CSV Versions as current data."

Domain expert: "The Companion Website should create an Upload Session and give the agent an Upload Token for that session."

Developer: "Does the user need an account?"

Domain expert: "No. The Upload Session is anonymous, and access is scoped by the Viewer URL and Upload Token."
