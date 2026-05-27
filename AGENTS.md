# Agent Notes

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

# [data-work] recent context, 2026-05-26 9:32pm CDT

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (18,386t read) | 336,210t work | 95% savings

### May 24, 2026
273 12:32p 🟣 End-to-End Smoke Test Passes — Full Upload→SSE→CSV Relay Verified Against Production Server
274 12:33p 🟣 Browser UI Verified — Landing Page Renders Correctly at localhost:4173
275 " 🟣 Session Creation UI Flow Verified End-to-End in Browser
276 " 🔵 tab.playwright.evaluate() Cannot Access localStorage — Read-Only DOM Scope Only
277 " 🔵 Upload Token Extractable from DOM Snapshot via Regex as localStorage Workaround
278 " 🟣 Full POC Loop Verified — CSV Upload Triggers Live Browser Table Update via SSE
279 12:34p 🟣 POC Complete — Screenshot Captured Showing Live CSV Table After Agent Upload
### May 26, 2026
686 8:37p 🔵 data-work Project Structure Identified
687 " 🔵 CSV Data Work POC Architecture Documented
689 " 🟣 California Housing Dataset Downloaded to data/housing.csv
713 8:44p 🔵 POC Hosted CSV Preview Architecture — Project Structure
717 " 🔵 CSV Companion Website POC — Full Architecture Deep Dive
741 8:54p 🔵 CSV Sharing POC Architecture: Express Server with SSE Real-Time Push
742 " 🔵 CSV Companion: Unified Dev/Prod Server with Vite Middleware and Security Utilities
761 9:00p 🔵 CSV Data Work POC — Full Architecture Map
768 9:01p 🔵 CSV Data Work Skill Architecture Overview
770 " 🔵 housing.csv Dataset Profile and Missing Data
771 " 🔵 Companion Website Running Locally on Port 3000
772 " 🟣 Dropped longitude Column — Created housing_without_longitude.csv
773 9:02p 🔵 Upload Endpoint Requires Bearer Token — 401 Without Authorization Header
779 9:04p 🔵 Full POC Architecture: Express Backend + React Frontend + SSE Live Preview
780 " 🔵 Project Has Untracked TypeScript Build Config and Deleted Legacy Agent Skills
783 " 🟣 TDD Test Written for Two New Server Features: Auth-Optional Upload and CSV Download Endpoint
784 " 🔵 Dual TypeScript Config: Client Uses Bundler Resolution, Server Uses NodeNext
787 9:05p 🔄 Server Logic Extracted to app.ts — createApp Factory Pattern Implemented
788 " ⚖️ Auth Removed from Upload Endpoint for POC — Replaced with Hardcoded Placeholder Token
791 " 🔴 Vite Started During Tests Despite serveClient:false — Fixed by Checking options.serveClient === undefined
792 " 🟣 Test Suite Passes — Auth-Free Upload and CSV Download Endpoint Verified
793 9:06p 🟣 React Frontend Updated to Match Auth-Free POC — Download URL Added to UI
796 " 🔵 Combined Multi-File Documentation Patch Failed — All Three Docs Still Show Pre-POC Auth Content
797 9:07p ✅ Documentation Updated — Auth Token Removed, CSV Download Endpoint Added to README, SKILL.md, and ADR
798 " 🟣 Full Build Passes — Vite Production Build and TypeScript Server Compile Both Succeed
799 " 🟣 End-to-End Upload and Download Workflow Verified Live Against Running Server
800 " 🔵 Live Session Viewer UI Confirmed — All New POC Elements Visible in Browser
806 9:08p 🔵 Entire POC Codebase Is Untracked — Only ADR, AGENTS.md, pickup.md and .agents Deletions Are Staged
815 9:11p 🔵 data-work Project Structure — CSV Companion Website POC
817 " 🔵 Backend Server Running on Port 3000 — Session d20658ef Available
819 " 🔵 Session d20658ef CSV Downloaded Successfully — Longitude Column Present
821 " 🔵 pandas Not Available in System Python — Fallback Required
823 " 🟣 Longitude Column Dropped from Session CSV Using Python stdlib csv
824 9:12p 🟣 Longitude Column Removed and Re-uploaded to Session d20658ef via Backend API
837 9:14p 🔵 data-work Session Upload/Download Architecture Traced
842 9:16p 🔵 macOS Missing `timeout` Command and Server Connectivity Issue
847 " 🔵 Session CSV Already Has Longitude Removed
849 9:18p 🟣 Longitude Column Dropped and Re-uploaded to Session d20658ef via Backend API
859 9:20p 🔵 Upload-Diff UI Design Brainstorm Initiated — Sessions Currently Store Only Latest CSV
864 9:22p ⚖️ User Workflow Preference: Parallel Experiments with Minimal Interaction
866 9:24p ⚖️ Upload-Diff Feature Goal: Smooth Visual Change Explanation, Not Just SSE Notifications
883 9:29p ⚖️ Upload-Diff UX Concept Finalized: Data-Story Playback with Morphing Table and Camera Movement
890 9:31p ⚖️ User Approved "Morphing Data Story Playback" as the Upload-Diff Variant Name

Access 336k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>