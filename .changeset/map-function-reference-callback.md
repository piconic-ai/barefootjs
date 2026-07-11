---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Resolve a bare-identifier callback passed to a value-position higher-order array method (`tags.map(format).join(' ')`, where `format` is a same-file `const`/`function` declaration rather than an inline arrow) to its declaration, one hop, reusing the same scope-resolution machinery #2090 established for `.sort(fnref)` comparators. Previously this refused with `BF101` on every non-Hono template adapter since there was no arrow body to serialize into the runtime evaluator. Generalizes to every method in the higher-order callback set (`map`, `filter`, `sort`, `toSorted`, `reduce`, `reduceRight`, `every`, `some`, `find`, `findIndex`, `findLast`, `findLastIndex`, `flatMap`), not just `.map`. Resolution respects lexical scoping — a bare identifier bound by an enclosing callback arrow's own parameter, or by an enclosing loop's item/index variable, is left unresolved rather than mis-resolved against a same-named module-scope const/function. Also fixes all 7 non-go-template adapters (Blade, Twig, Jinja, minijinja, ERB, Mojolicious, Xslate) whose text-position expression rendering wasn't threading the IR-carried pre-parsed expression tree through, silently discarding the resolution (and any other future `.parsed`-carried optimization) for that position.
