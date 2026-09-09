File claims for the active team. `op: "acquire"` takes paths you will edit; `release` drops them; `list` shows every claim. Auto-claim also happens on write/edit/ast_edit. Conflict text names the owner id for `hub send`.

- Prefer `claim` `acquire` up front for a directory you own.
- Conflict? `hub send` that owner id, or pick a different file.
- NEVER use bash/eval to write files to bypass claims.
