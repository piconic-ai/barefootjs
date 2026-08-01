---
"@barefootjs/go-template": patch
---

Refuse loudly when a per-row prop override would leave a derived child field stale (#2448)

Follow-up to #2445. That fix re-applies a loop-dependent prop per row via the
`bf_with_props` runtime helper, which overrides fields on the child's
already-constructed shared instance. It cannot re-run `New<Child>Props`, which
is where memos are computed:

```go
func NewBadgeProps(in BadgeInput) BadgeProps {
	return BadgeProps{ ..., N: in.N, Dbl: in.N * 2 }
}
```

So `N` became per-row correctly while `Dbl` kept the one-shot constructor's
value (`in.N == 0` → `0`) on every row — silently wrong output, no diagnostic.

The Go adapter now detects this and refuses with `BF101` naming the child, the
overridden prop, and the field that would go stale, suggesting either
`/* @client */` on the loop position or lifting the derived value into the
parent. Two alternatives were evaluated and rejected: a per-row props slice
(the `.TodoItems` wrapper shape) is populated by the route handler rather than
the generated constructor, so extending it here would demand handler work for
a component the user never named at a call site; and calling `New<Child>Props`
at template-execution time would require the generated components package to
register per-component constructors into the template FuncMap, a breaking
setup change for every Go user. Both are worse than a loud refusal, and the
behaviour being replaced is silently wrong output.

Detection is a structural walk over the child's own memo `parsed` bodies,
collecting which input props each reads. It is best-effort by construction — a
memo with no resolvable parsed body is skipped — so its failure mode is a
missed refusal (today's behaviour), never a wrong one. The walk carries an
exhaustiveness pin so a new `ParsedExpr` kind cannot silently drop a
dependency.

New fixture `composite-row-child-derived-prop` pins the shape: `BF101` on Go,
rendered correctly by every other adapter and CSR, which construct the child
fresh per row and are unaffected.
