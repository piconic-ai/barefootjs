---
"@barefootjs/jsx": patch
---

`ParsedExprEmitter` implementations now supply `primitives` (the operand typing at the emission site and a `NativeSafeTable`). `emitParsedExpr` passes each primitive operation's `PrimitivePlan` (from the new `planPrimitive`) as the last argument of `literal`, `member`, `indexAccess`, `binary`, `unary`, `logical` and `conditional`. The template adapters accept the plan and do not use it yet, so their output is unchanged.
