---
"@barefootjs/jsx": patch
"@barefootjs/client": patch
---

Fix a keyed `.map()` loop whose row body has a preamble-built leaf child (`const cells = []; cells.push(<td>{stateLabel}</td>); return <tr key={t.id}>{cells}<td>{t.name}</td></tr>`) going stale on same-key item updates. `mapArray` reuses the same row DOM node via per-item `setItem`, re-running only the row's wired text/attr slots — a preamble-derived child like `{cells}` had neither, so it froze at its mount-time content forever while sibling wired slots (`{t.name}`) updated normally. A loop-body expression child whose free identifiers reference a preamble-declared local is now classified as a preamble-patched region: it renders with the same `<!--bf:sN-->...<!--/-->` slot marker a reactive text uses (so SSR/CSR row templates stay byte-identical), but the client wires it via a dedicated region-patch effect — `patchSlotRange` (new `@barefootjs/client` runtime helper) replaces the marker-delimited DOM range in place whenever the re-run preamble produces different content, instead of a `.textContent` assignment that would corrupt markup.
