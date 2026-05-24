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
