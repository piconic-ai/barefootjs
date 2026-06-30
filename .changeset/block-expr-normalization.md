---
"@barefootjs/jsx": minor
---

Normalize value-producing block-bodied callbacks into a single expression (#2040, carved from #2018 stage 5). A higher-order callback (`.sort` / `.reduce` / `.find` / `.some` / `.every` / `.flatMap` …) written with a `{ … }` block body now folds to an expression when its body is purely-functionally expressible, instead of being refused with "only single-`return` block-body functions are supported":

- **let-inline** — pure `const` bindings inline into the expression that uses them.
- **early-return / value `if`** — `if (c) return A; return B` (and `if/else`, `else if` chains) become a ternary in value position.

The folded expression flows through the existing `ParsedExpr` surface (the #2018 callback evaluator / template-native lowering), so no new IR statement shapes are carried.

Genuinely **imperative** block bodies — raw `for` / `while` loops, `break`, local re-assignment / mutable state, side-effecting or I/O calls — have no value-position lowering and stay `unsupported`, surfacing the adapter's BF101 with an actionable message (rewrite an accumulation loop as `.reduce(...)`, or move the body to a `/* @client */` value that runs natively on the client).

New public helper `foldBlockToExpr(ParsedStatement[])` performs the normalization; `convertNode`'s arrow path uses it. The single-`return` fast path is unchanged, so existing output is byte-identical.
