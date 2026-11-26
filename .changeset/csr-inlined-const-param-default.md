---
"@barefootjs/jsx": patch
---

A component-scope const that reads a parameter-destructured prop whose default is a primitive literal (`function Label({ s = 'd' }) { const local = [s, 'z'] }`, or a default reading such an earlier binding, `{ a = 'A', c = a }`) now applies that default when the client template inlines it, in markup, a memo, a signal seed and a child prop, instead of reading `_p.s` bare. A default that allocates or names a binding (`{ b = ['y'] }`, `{ b = fallback }`) is still read as `_p.b` there: copying its text into each read would evaluate it once per read and resolve it against the template's scope. The template's relocation of a const also splices each rewrite once, so a default's own text (a string that spells another prop's name) is kept as written.
