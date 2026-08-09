# Agent Notes

## Current Product Focus: Agent-First Sessions

Focus current product design and development on the **agent-first** lifecycle:

1. The agent creates an Upload Session by calling `POST /api/sessions`.
2. The API returns the session ID, Viewer URL, and agent-facing upload URLs.
3. The agent gives the Viewer URL to the user.
4. The user opens the Viewer URL and connects to the session's live preview stream.
5. The agent prepares the Working CSV in its Python Workspace, ensures every row has a valid unique `_row_id`, and uploads it to the session's Working Upload URL.
6. The agent continues uploading Working CSV previews after meaningful transformations so the user can review changes live.

Treat this agent-first journey as the primary focus when making product, architecture, documentation, testing, and UX decisions.

Browser-first session creation and browser CSV upload remain valid, supported product paths. They are not deprecated, secondary, or fallback behavior; they are simply outside the current development focus unless the user explicitly asks to work on them.

## Git Push

The configured `origin` remote may use HTTPS, which can fail in Codex because Git cannot prompt for GitHub credentials:

```sh
git push origin main
```

If that happens, use the authenticated SSH remote URL directly:

```sh
git push git@github.com:yueh-ai/data-work.git main
```

If you want to make SSH the default for future pushes, update the remote:

```sh
git remote set-url origin git@github.com:yueh-ai/data-work.git
```

## Handoff Documents

The `handoff` skill saves handoff documents to the operating system's temporary directory, not the current workspace.

On macOS, find the active per-user temp directory with:

```sh
echo "$TMPDIR"
```

or:

```sh
getconf DARWIN_USER_TEMP_DIR
```

To find a specific handoff document, search the temp directory first:

```sh
find "$TMPDIR" -name 'csv-data-work-handoff.md' -print 2>/dev/null
```

For a broader search across likely temp locations:

```sh
find "$TMPDIR" /tmp /var/tmp -iname '*handoff*.md' -print 2>/dev/null
```


<claude-mem-context>
# Memory Context

# [data-work] recent context, 2026-05-31 7:54am CDT

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (21,937t read) | 642,908t work | 97% savings

### May 28, 2026
S92 Update csv-data-work skill with row_id creation instructions and session startup polling logic for agent-sourced data (May 28 at 9:12 PM)
S91 Design row_id creation strategy for agent-sourced vs UI-uploaded CSV data, and update the csv-data-work skill accordingly (May 28 at 9:12 PM)
S93 User approved 2-event SSE design for agent-owned CSV session bridge; session now transitioning to implementation plan (May 28 at 9:51 PM)
1505 10:59p 🟣 Session Page DOM Verified: All Agent Controls Present in UI
1506 " 🔵 Browser Automation Cannot Trigger File Input — Handoff Upload Must Be Verified via curl
1507 " 🔵 evaluate() Sandbox Runs in Non-Browser Context — File, Blob, DataTransfer All Undefined
1508 " 🟣 Full Handoff Lifecycle Verified End-to-End in Browser — All Stages Pass
1509 11:00p 🟣 Working Upload and Refresh Trade-off Verified End-to-End in Browser
1510 11:02p ⚖️ Agent-Owned CSV Session Bridge Architecture
1511 " 🔵 CSV Session Bridge Code Review Scope and Verification State
1512 " 🟣 All 7 Tasks Complete — Final Code Review Dispatched as Pascal
1513 " 🔵 Server-Side PendingHandoff TTL and Race-Condition Guard
1514 " 🔵 SSE Reconnect Replays Handoff But Never Working CSV
1515 " 🔵 csvRows.ts: PapaParse-Based Normalization and Validation
1516 " 🔵 Frontend Discriminated Union for Preview Event State
1517 " 🔵 Test Suite Coverage Map for Agent-Owned CSV Bridge
1518 " 🔵 Upload Error Code Surfaced in UI Instead of Human-Readable Message
1519 11:04p 🔵 Code Review: Agent-Owned CSV Session Bridge Branch Approved with Minor UI Labeling Issue
1520 " 🔴 Fixed Responsive Control Band Overflow in CSS Layout
1521 " ⚖️ Design Decision: Preserve Handoff Preview Labels After Confirm/Expiry via Status Field
1522 " 🔴 Handoff Preview State Preservation After Confirm/Expiry
1523 11:05p 🔵 Handoff Preview Bug: Exact Code Location in main.tsx
1524 " 🔴 Handoff Preview State Preserved with Status Discriminant
1525 " 🔴 Handoff Preview Fix Verified: Typecheck Clean, All 26 Tests Pass
1526 " 🔴 Handoff Preview Fix Committed: SHA 881fed2
1527 11:06p 🔴 Fixed Handoff Preview Mislabeling After Confirm/Expiry in main.tsx
1528 " 🟣 Exact Implementation: handoffStatus Discriminant in PreviewEvent Type
1529 " 🔵 Full Test Suite for Agent-Owned CSV Session Bridge: 26/26 Passing
1530 " 🔵 Browser Verification Confirmed: Handoff Label Fix Works End-to-End in Live App
1531 11:07p ⚖️ Final Code Review Agent Spawned for Complete Branch Diff (922af3c..881fed2)
1532 " 🟣 Agent-Owned CSV Session Bridge — Final Code Review
1533 " 🔵 Agent-Owned CSV Session Bridge — Full Diff Scope Confirmed
1534 11:08p 🔵 app.ts Implementation — Backend Session Bridge Architecture Details
1535 " 🔵 csvRows.ts — Split normalizeUploadedCsv Into Two Mode-Specific Exports
1536 " 🔵 main.tsx — UI State Model Uses PreviewEvent Union Type With handoffStatus
1537 " 🔵 index.test.ts — Dynamic Import Pattern Gives Fresh Module State Per Test Server
1538 " 🔵 Final Code Review Approved: Only Stale Root Docs Remain as Minor Issue
1539 11:09p 🔵 goal.md Describes Superseded "Agent Uploads Current CSV" Architecture Throughout
1540 " 🔵 Stale Endpoint References Found in goal.md, pickup.md, and ADR 0001 Outside the Diff
1541 " 🔵 SKILL.md Updated With Full Handoff/Working Flow and Python Row Identity Helpers
1542 " 🔵 Stale Architecture Language Audit: Exact Lines Identified Across docs, goal.md, pickup.md
1543 " ✅ goal.md Updated to Reflect Agent-Owned CSV Architecture Throughout
1544 11:10p ✅ pickup.md Updated to Agent-Owned Architecture and Redirects Future Agents to ADR 0003
1545 " 🔵 Post-Cleanup Doc Audit: No Stale API Endpoint References Remain; ADR Body Text the Only Residual
1546 11:11p 🟣 Agent-Owned CSV Session Bridge Branch Complete: 13 Files, 827 Insertions over Base SHA 922af3c
1547 " 🔵 Branch codex/agent-owned-csv-session-bridge Verified Ready for Merge/PR
### May 31, 2026
1548 7:48a 🔵 data-work project git status: 19 commits ahead of origin/main
1549 " 🔵 Multiple Codex agent sessions and a bun server running against data-work project
1550 " 🔵 claude-mem bun daemon has been running for 31+ days on port 37777
1551 " 🔵 10+ Codex app-server sessions accumulated, some running 3+ days
1552 7:49a 🔵 No TCP listeners on any data-work project processes — no dev server running
1557 7:53a 🔵 CSV Companion Website Server Architecture and Run Commands
1558 " 🔵 CSV Companion Website Server Not Running on Ports 3000–3003

Access 643k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
