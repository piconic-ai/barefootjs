---
"@barefootjs/go-template": patch
"@barefootjs/perl": patch
"@barefootjs/jinja": patch
"@barefootjs/erb": patch
"@barefootjs/php": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
---

Each template runtime gains the JS primitive helpers it was missing (`to_number`, `to_string`, `plus`, `lt` / `le` / `gt` / `ge`, `strict_eq`, `neg`, and `truthy` on Perl). Each one calls the callback evaluator's implementation of the same operation, so a template that calls it and a callback body give the same answer. No compiled template calls them yet, so rendered output does not change. A runtime keeps its existing name where it has one: Go `bf_eq` / `bf_lt` / `bf_neg`, PHP and Java `eq`, Java `neg`.
