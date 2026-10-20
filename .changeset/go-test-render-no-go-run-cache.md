---
"@barefootjs/go-template": patch
---

The `test-render` harness builds each render program with `go build -o` into its temporary directory and runs the binary from there, instead of `go run .`. Since Go 1.24, `go run` keeps every linked executable in the Go build cache, so a full conformance run filled `GOCACHE` with several GB of binaries that are never reused. Rendered output is unchanged.
