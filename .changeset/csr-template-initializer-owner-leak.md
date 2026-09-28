---
"@barefootjs/client": patch
---

Fixed a leak in `@barefootjs/client/runtime`'s CSR mount path: `render()` (and the other `template()` call sites — `createComponent()`'s by-name and `ComponentDef` paths, and the conditional-branch template evaluator in `insert.ts`) called a component's compiled `template()` function before `init()` ran and with no reactive owner in scope. When the JSX read a local bound to an imported helper's call (`const value = watch(props.source); return <p>{value()}</p>`), the compiler inlines that call verbatim into the template so it has an initial value to render — by design, matching Hono SSR's contract. If the helper created a signal and registered `onMount`/`onCleanup` (the natural shape for bridging outside state into a signal), that registration had no owner to release it: `onMount` ran synchronously and `onCleanup` was a permanent no-op, so the subscription outlived the component for the life of the page.

Every `template()` call now runs inside a throwaway reactive root that is disposed immediately after it returns, giving that call a real owner so anything it creates is torn down before `template()`'s result is used — the retained instance's own `init()` (run moments later under its own longer-lived root) creates the real, persisted signal.
