---
"@barefootjs/go-template": patch
---

Fix a `??` expression used as an operand inside a condition (a ternary/`&&` test that lowers to `{{if …}}`), either as a comparison operand or underneath `.length`, emitting unparenthesised into the enclosing Go template call (`gt (len or .Todos bf_arr) 0`, `gt or .Count 0 0`, #3249). `html/template` parsed the bare `or`/`bf_nullish` call as extra sibling arguments of `gt`/`eq`/`len`, so the template compiled without error but panicked at render time ("wrong number of args").

`renderConditionExpr`'s `binary` arm gated parens with `needsParensInGoTemplate`, an AST-kind check (`member.length` / arithmetic `binary` / unary negation) that never recognized a `logical` (`??`) operand, and its `member`/`.length` arm didn't wrap its object operand at all. Both now use `wrapIfMultiToken` on the rendered operand string, matching the sibling `logical`/`unary`/`index-access` arms in the same function.
