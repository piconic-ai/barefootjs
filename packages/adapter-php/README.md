# @barefootjs/php

The engine-agnostic **PHP runtime** for [BarefootJS](https://barefootjs.dev) —
the `BarefootJS` class (`BarefootJS.php`) that compiled marked templates call
as the `bf` object (`bf.json(...)`, `bf.spread_attrs(...)`, the array/string
method helpers, hydration markers, child-component rendering).

This package has **no dependencies** beyond core PHP (>=8.2). Everything that
depends on *how* a template is rendered — JSON marshalling, raw-string
marking, JSX-children materialisation, named-template rendering, and
template-variable-name mangling — is delegated to a pluggable **backend**, so
the same runtime can drive any PHP template engine (Twig, Blade, ...).

```
JSX → IR → (compile-time adapter) → marked template ─┐
                                                      ├─► rendered by the host's
  BarefootJS runtime ── backend ── template engine ───┘    template engine
```

## Backend contract

A backend implements five methods:

| Method | Purpose |
|--------|---------|
| `encode_json($data)` | JSON-encode a value (injectable; defaults to `Barefoot\Json::canonicalEncode`) |
| `mark_raw($str)` | Mark a string so the engine emits it without re-escaping |
| `materialize($value)` | Resolve a captured-children value to a string |
| `render_named($name, $bf, $vars)` | Render a named template with `$bf` bound |
| `ident($name)` | Mangle a template-variable name for this engine's reserved-word set |

Inject a backend with `new BarefootJS($c, ['backend' => $backend])`.

## `null` and `undefined`

PHP's `null` is JS `null`. JS `undefined` is `Barefoot\Undefined::value()`,
a singleton (`bf.undefined()` / `$bf->undefined()` in a template). A props
array already has the four states a JS prop has, so no wrapper type is
needed:

| JS | Props array |
| --- | --- |
| prop not passed | key left out |
| `undefined` passed (`c={props.c}` with `c` unset) | `['c' => Undefined::value()]` |
| `null` | `['c' => null]` |
| a value | `['c' => 'x']` |

A destructure default applies to the first two only. `json_decode` gives
`null` for JSON `null` and leaves a missing key out, which is what you want;
nothing walks decoded data to convert it.

`Undefined` prints as `''` and `jsonSerialize()`s to `null`, but it is a PHP
object: truthy for PHP's own `if`, and `??` / `isset` treat it as set. Test a
value with `Barefoot\Undefined::isUndefined()`, `isNull()` and `isNullish()`
(`== null`) instead, or `bf.is_nullish(v)` / `$bf->is_nullish($v)` in a
template. `Barefoot\Json::ready()` turns a value into what `JSON.stringify`
sees (an `undefined` member dropped, an `undefined` element `null`); the
runtime runs it before any backend encoder.

Migration: a host that passed `null` to mean "unset" now gets JS `null`
semantics (`'btn ' + c` renders `btn null`, and a destructure default no
longer applies). Leave the key out to leave a prop unset.

## Reference implementation

[`@barefootjs/twig`](../adapter-twig) provides `Barefoot\TwigBackend`
(targeting `twig/twig`) plus the compile-time adapter that emits Twig
templates (`.twig`).

## Composer

The Packagist distribution name is `barefootjs/php`. The npm package
ships the same `src/` so the monorepo integrations can consume it without a
separate install.


This package is maintained in the BarefootJS monorepo and is mirrored to a
Packagist-facing repository only for Composer distribution.

- Source of truth: <https://github.com/piconic-ai/barefootjs/tree/main/packages/adapter-php>
- Monorepo: <https://github.com/piconic-ai/barefootjs>
- npm package: `@barefootjs/php`
- Composer package: `barefootjs/php`

Do not send implementation pull requests to the Packagist mirror. Send changes to
the monorepo path above; the release workflow splits this directory and pushes the
mirror automatically.

## Tests

```sh
php tests/run.php
```

Zero-dependency, PHPUnit-free TAP-ish harness (`tests/_harness.php`). Every
`test_*.php` file is also independently runnable via `php tests/test_foo.php`.
Includes the golden helper-vector (`test_helper_vectors.php`) and
ParsedExpr-evaluator (`test_eval_vectors.php`) conformance suites — see
`spec/template-helpers.md`.
