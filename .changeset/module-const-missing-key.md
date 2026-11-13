---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

A module or component-local literal const read with a key it does not have renders `undefined`, as Hono does, on every template adapter (#3813). `const QS = ['a', 'b']; const REC = { k: 'v' }` read as `QS[9]`, `QS['01']`, `QS[-1]`, `REC['nope']` or a nested `NEST.a.c` omits the attribute, renders nothing in text, takes the right side of `??` and the falsy branch of a ternary. Mojolicious used to fail the render (`Global symbol "$QS" requires explicit package name`) and Go `html/template` with `can't evaluate field QS`; the other adapters read an unbound template variable, which renders empty by accident (and `QS[-0]` rendered empty instead of `QS[0]`).

The decision is one shared helper, `lookupStaticConstMember` (`@barefootjs/jsx`), that reads the const's parsed literal: an element or listed key gives its value, and a key the literal provably lacks gives `undefined`, which each adapter spells. The literal-index form (`QS[-1]`) and nested reads go through it too. `lookupStaticArrayElement` is replaced by it. The computed-const object projection uses the same decision.

A key the literal lacks but its prototype has (`REC['toString']`, `REC.constructor`, `QS['map']`) reads an inherited function in JS. Every template adapter now refuses it with BF101 instead of rendering it as missing; `/* @client */` defers the read to the browser. The refusal is one decision (`spellStaticConstMember`), taken where an adapter spells the read and, by one shared pass (`refuseInheritedConstServerReads`), in every value the server render computes: a server-rendered position, and each signal seed, memo body, const initializer and called function it reads (`walkServerReads`). Names resolve lexically and a function is entered only where it is called, so a loop row named like a client-only helper, or a listed key read beside a client-only method (`{H.safe}|{/* @client */ H.get()}`), is not refused.

Go also spells a written `undefined` in a condition as `bf.Undefined` (it read a `.Undefined` field and failed the render), and omits an attribute whose value is `undefined` or `null` (it rendered `attr=""`).
