# PR review instructions

Read `CLAUDE.md` (symlinked as `AGENTS.md`) before reviewing. It is the design contract for this
codebase, not style guidance — use it as review criteria. When you flag a violation, name the
section instead of restating it.

## Design conformance (must-address)

Check the diff against the four **"Never …"** conventions in CLAUDE.md's Code Conventions section.
A violation is must-address even when the code works. Name the violated convention and point to the
sanctioned alternative it prescribes (IR metadata / AST walk, structured IR through a single
renderer, the lowering-plugin registry, `BindingScope`).

## Coverage coupling (must-address)

A PR that widens what the compiler accepts must add at least one conformance fixture under
`packages/adapter-tests/fixtures/` in the same PR (`spec/subset-conformance.md`, change-time
coupling rule). Fixture *existence* for the registered extension halves is CI-gated; review owns
what CI cannot check:

1. **Fixture meaningfulness.** Does the fixture exercise the essential shape of the extension?
   Should adversarial cases (empty values, markup, multibyte) be added as data points?
2. **New extension categories.** If a PR introduces an extension kind no registry anticipates,
   require the registry and its coverage floor to land in the same PR as the first member.

## Test placement

Flag tests at the wrong layer per CLAUDE.md's testing table: an E2E test for static-only
attribute/class/ARIA changes (an explicit anti-pattern), event→setter wiring asserted anywhere but
a component IR test, template HTML asserted outside adapter conformance fixtures, client JS
behavior asserted outside CSR conformance fixtures, and hydration-correctness fixes not verified
with an E2E test.

## Priorities

The cardinal failure mode of this compiler is **silent divergence** — output that differs from the
contract without an error (SSR/CSR mismatch, an emitter that drops content instead of refusing
loudly). A silent-divergence risk outranks any style concern. When you find a reproducible
divergence, steer it toward the three-piece set (known-limitation issue + fixture asserting the
correct output + pins on the broken side), not a prose report.

## Output

Write reviews in English.
