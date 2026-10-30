---
"@barefootjs/go-template": patch
---

A rest bag whose binding capitalizes to a field the generated Go structs already have (`{ label, ...scopeID }`, or a props object named `scopeID` read as a whole) now builds. The bag's field takes `_` until it is free (`ScopeID_`); it was `ScopeID`, declared twice.
