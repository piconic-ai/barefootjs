---
'@barefootjs/perl': patch
'@barefootjs/mojolicious': patch
'@barefootjs/xslate': patch
'@barefootjs/jsx': patch
---

Mojolicious and Xslate now print an arithmetic result the way JavaScript does (#3380). The Perl runtime's `string` formats a number with JS `Number::toString`, where it used to use Perl's `%.15g`. `%.15g` padded a small exponent (`1.23456789e-06`) and dropped digits past 15 (`0.1 + 0.2` printed `0.3`). Both adapters route a top-level arithmetic output, in text or in an attribute, through that helper. This closes the `number-exponent-boundary-spelling` limitation on every adapter.
