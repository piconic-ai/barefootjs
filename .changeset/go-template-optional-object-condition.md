---
"@barefootjs/go-template": patch
---

Fix an optional-chained member read from an object prop used in a condition. The Go template adapter now lowers `props.meta?.count` through `bf_get`, matching value-position behavior and correctly reading JSON-decoded map keys instead of silently testing an empty `.Meta.Count` field (#3275).
