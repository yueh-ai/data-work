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

# [data-work] recent context, 2026-05-26 10:15pm CDT

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (18,742t read) | 1,017,908t work | 98% savings

### May 26, 2026
897 9:32p ⚖️ Parallel A/B Strategy Comparison via Subagents with Git Worktrees
899 9:33p 🔵 data-work Project State: Uncommitted Source Tree on main
900 " 🟣 Two Git Worktrees Created for A/B Strategy Comparison
901 " 🟣 Both Strategy Worktrees Seeded and Dependencies Installed
902 " 🔵 Both Worktrees Have Green Baseline Test Suite
904 " 🟣 Subagent "Popper" Dispatched for Variant A: Morphing Data Story Playback
905 9:34p 🟣 Subagent "James" Dispatched for Variant B: Inspectable Before/After Compare
907 " ⚖️ Variant B: Inspectable Before/After CSV Compare Design
910 9:35p 🔵 Worktree Has No Git Repository
911 " 🔵 Backend Session Model Only Stores Single Upload — No History
912 " 🔵 Existing Frontend Shows Only Current CSV — No Comparison UI
913 " 🔵 Browser Automation Environment: Playwright Chromium Cached but No npm Package
915 9:36p 🟣 csvStory.ts: Pure Data Story Comparison Module
916 " 🟣 React main.tsx: Staged Morphing Animation Playback Wiring
917 " 🟣 CSS Animation System for Morphing Data Story Playback
918 " 🔴 package.json Test Glob Requires Quoting for tsx --test
919 " ✅ Full Test Suite (3/3) and TypeCheck Pass for Variant A Worktree
920 " ✅ Production Build Clean - Variant A Morphing Story Playback
921 " 🔵 Hero Demo Test Data Confirmed Present in Worktree
922 " ✅ Dev Server Running on PORT=3101 with Benign WebSocket Warning
927 9:37p 🔵 End-to-End Smoke Test Confirms Morphing Story Playback Works Correctly
928 " 🟣 Inspectable Before/After Compare UI Implemented in main.tsx
929 " 🟣 Compare UI CSS Added to styles.css
930 " 🔴 Raw Arrow (->) in JSX Caused TypeScript TS1382 Parse Error
931 " 🔵 Variant B Smoke Test Confirmed Working via Browser at Port 3102
936 9:40p 🟣 Variant B Implemented: Inspectable Before/After CSV Compare UI
937 " 🟣 Variant A Implemented: Morphing Data Story Playback
938 " 🔵 Git Worktrees Show "prunable" and Fail git status Due to rsync Overwrite
939 9:41p 🔵 Playwright Recording Script Fails: page.goto Times Out on localhost:3101
940 " 🔴 Fixed Playwright Recording Timeout: networkidle → domcontentloaded
942 " 🟣 Screen Recordings Captured for Both A/B Variants
945 9:42p 🔵 WebM Recordings and Preview Frames Confirmed on Disk
963 10:03p 🔵 CSV Upload Edge Case Testing Plan Defined for Dual Prototype Variants
964 10:04p 🔵 Variant A (morphing-data-story) Architecture: Client-Side Animated Story Engine
965 " 🔵 Variant B (before-after-compare) Architecture: Server-Side Delta with Side-by-Side Sample Tables
966 " 🔵 Key Behavioral Difference: Cell-Only Changes Treated Differently Across Variants
967 10:05p 🟣 Three Controlled CSV Test Scenarios Generated from Housing Dataset
968 " ✅ Both Prototype Dev Servers Started on Separate Ports for Parallel Testing
969 " 🟣 Playwright Recording Script Created for Extra CSV Scenario Testing
970 " 🟣 Extra Scenario Recording Run Started; First Recording Completed Successfully
971 10:06p 🟣 All 6 Extra Scenario Recordings Completed Successfully
972 10:07p 🔵 Confirmed Behavioral Differences: Variant A vs B Across All Three CSV Scenarios
973 10:11p 🟣 Extra Scenario Recordings: Cell Changes, Feature Column, and Simultaneous Operations
974 10:12p 🔵 data-work Git State: Two Prototype Branches, Both at Base Commit, New Code Untracked
975 " 🔵 Stale Git Worktree References on codex/ Branches After Failed Worktree Setup
976 " 🔵 Stale Worktree Markers Resolved: codex/ Branches Cleanly Unlinked
977 10:13p 🔵 rsync --exclude='.git' (not '.git/') Required to Preserve git Worktree Pointer File
978 " 🟣 Both Prototype Branches Pass Tests, Typecheck, and Build Clean
979 " 🟣 morphing-data-story Prototype Committed to codex/morphing-data-story Branch
980 10:14p 🟣 Both Prototype Branches Committed and Pushed to GitHub — PRs Ready

Access 1018k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>