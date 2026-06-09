---
"@barefootjs/jsx": patch
---

fix(profile): de-dup parens, gate the uninstrumented-effect scan, align candidate loc (#1849 B6 review)

Follow-up to the B6 hot-subscribers work:

- The hot-subscribers report no longer renders doubled parentheses (`((unresolved))` / `((uninstrumented — …))`) — the location is wrapped exactly once.
- `buildProfileReport` skips the per-source `createEffect` candidate scan entirely unless a runtime fallback `e<n>` id is present, so the common fully-instrumented case does no extra work.
- Candidate call-site line numbers are computed from the call node's start to match the compiler's effect locations exactly.
