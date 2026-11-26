---
"@barefootjs/jsx": patch
---

A component-scope const that reads a parameter-destructured prop with a default (`function PV({ b = ['y'] }) { const local = [b.length, 'z'] }`) now applies that default when the client template inlines it, in markup, a memo, a signal seed and a child prop, instead of reading `_p.b` bare and throwing when `b` is not passed. The template spells every props binding through one shared read (`templatePropReads`), and its relocation into template scope splices each rewrite once, so a default's own text (a string that spells another prop's name) is kept as written.
