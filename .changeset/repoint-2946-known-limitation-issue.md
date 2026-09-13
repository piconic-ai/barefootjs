---
"@barefootjs/erb": patch
"@barefootjs/blade": patch
"@barefootjs/twig": patch
"@barefootjs/jinja": patch
"@barefootjs/xslate": patch
"@barefootjs/mojolicious": patch
"@barefootjs/rust": patch
"@barefootjs/go-template": patch
---

Repoints the `module-const-loop-source-computed` conformance pin's `issue` URL from #2946 (fixed, closed) to #2321 (the still-open "computed const as loop source can't be evaluated at SSR" design gap this fixture actually tracks). No behavior change — the BF101 refusal for a module-scope const computed via a function call is unchanged; only the tracking-issue attribution is corrected, per the `compat-issue-freshness` automation flagging the dangling link to a closed issue (#2967).
