---
"@barefootjs/cli": patch
---

Include `eval.go` in Go scaffold templates so all four Go adapters (chi/gin/echo/net/http) compile out of the box. Since #2018 `bf.go` references `SortEval`, `FoldEval`, `FilterEval`, `Env` etc. from `eval.go`, but the file was never added to the CLI's embedded scaffold templates.
