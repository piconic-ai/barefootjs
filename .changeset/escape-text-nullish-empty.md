---
"@barefootjs/client": patch
---

`escapeText` — the runtime helper that escapes interpolated text content for the initial client render (`<!--bf:sN-->${escapeText(expr)}<!--/-->` slots) — now renders a nullish value as empty text instead of stringifying it into literal `"undefined"` / `"null"`. This matches the JSX/Solid semantics the Hono SSR reference follows (`{undefined}` / `{null}` produce no text) and the reactive text-update path, which already coerces via `String(value ?? '')` (`dynamic-text.ts`, `client-marker.ts`). Previously a bare `{props.x}` reading an absent prop diverged from the server-rendered output at first paint — empty on SSR, literal `"undefined"` on CSR (#2137). Non-nullish values (including `0` and `false`) keep their `String()` form, matching the reactive path.
