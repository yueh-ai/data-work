# Agent Notes

## Project Goal

This repo is building a single-file Markdown skill for AI-assisted CSV data work.

The intended workflow is:

- A user provides a CSV file.
- The agent inspects and modifies it with Python code in a sandbox.
- The agent uploads the initial CSV to a companion website.
- After each code-driven CSV transformation, the agent saves the updated file and reuploads it so the user can inspect the latest data in the website.

See `goal.md` for the current product goal and open questions.

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
