---
"@barefootjs/cli": patch
---

fix(profile): stop git stderr leaking on a bad `--diff` ref (#1849 B8)

`readFileAtRef` now captures git's stderr (`stdio: pipe`) and folds its message into a single CLI error line, instead of letting git's raw `fatal: invalid object name …` leak ahead of the CLI's own message.
