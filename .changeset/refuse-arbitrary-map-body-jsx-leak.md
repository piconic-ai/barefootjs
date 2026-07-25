---
"@barefootjs/jsx": patch
---

Refuse (instead of silently leaking) a `.map()` callback body that constructs JSX in a statement before its `return` (callback-body fidelity, Stage 3 of `spec/callback-fidelity.md`).

An imperative array-builder body — `const out = []; for (const c of it.cells) out.push(<td>{c}</td>); return <tr>{out}</tr>` — cannot be lowered to a template. The single-return path collected every pre-`return` statement into the loop preamble verbatim via the type-stripper, which strips *types* but not JSX, so the raw `<td>{c}</td>` spliced into the emitted client bundle as invalid JS — a silent syntax-error leak with **no diagnostic** on any backend. The compiler now detects inline JSX in a pre-`return` statement and raises `BF021` with an actionable suggestion (return the JSX directly, e.g. via a nested `.map()` inside the returned element) instead of emitting the leak. Value-only preambles (`const label = it.name; return <li>{label}</li>`) are unaffected. A later Stage-3 PR renders these arbitrary bodies verbatim on JS-runtime adapters; until then the refusal is uniform across backends.
