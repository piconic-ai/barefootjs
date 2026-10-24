---
"@barefootjs/go-template": patch
---

On Go templates, a memo's SSR seed and its field type now come from one classification: the boxed-arithmetic shapes (`bf.Add` / `bf.Sub` / `bf.Mul` / `bf.Div` seeds, memo chains over them included) are decided once, and both the memo field's Go type and the constructor seed read that decision. `memoInitialFromParsedBody` becomes an ordered list of small per-shape arms; generated Go is unchanged for every existing fixture and component. A selection memo (`tab() === 'a'`) over a double-quoted or escaped string seed (`createSignal("a")`, `createSignal('it\'s')`) now folds to a `true` / `false` constant, read off the seed's parsed tree, as a single-quoted seed already did, instead of computing the same value through `bf.EvalExpr`.
