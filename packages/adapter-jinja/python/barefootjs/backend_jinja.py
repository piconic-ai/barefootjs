"""Python port of packages/adapter-xslate/lib/BarefootJS/Backend/Xslate.pm.

Jinja2 rendering backend for the `barefootjs` runtime.

The engine-agnostic runtime logic (the JS-compat value helpers, array/string
methods, hydration markers, child rendering) lives in `runtime.BarefootJS`.
This backend supplies the five engine-specific operations the runtime
delegates to, targeting Jinja2 syntax:

    encode_json(data)            -> JSON string (injectable encoder)
    mark_raw(str)                -> a value Jinja emits verbatim (no re-escaping)
    materialize(value)           -> resolve a captured-children value to a string
    render_named(name, bf, vars) -> render `<name>.jinja` with `bf` + vars bound
    is_undefined(value)          -> whether `value` is Jinja's `Undefined` sentinel

Pair it with the `@barefootjs/jinja` compile-time adapter, which emits Jinja2
`.jinja` templates that call the runtime as a `bf` object: `{{ bf.scope_attr()
}}`, `{{ bf.json(x) }}`, `{{ bf.spread_attrs(bag) }}`. Jinja auto-escapes
`{{ ... }}` interpolations (the Environment is built with `autoescape=True`);
helpers that emit markup return `mark_raw` (`markupsafe.Markup`) values so
they render unescaped, mirroring Kolon's `| mark_raw` / Mojo EP's `<%==` vs
`<%=` distinction.

Unlike a web-framework plugin, this has no dependency on a specific web
framework: a plain `jinja2.Environment` renders templates from a path, so it
runs under any WSGI app (Flask, Plack-equivalent) or none at all.
"""

from __future__ import annotations

import json as _json
import math
from typing import Any, Callable, Optional, Sequence

from jinja2 import ChainableUndefined, Environment, FileSystemLoader, Undefined
from markupsafe import Markup

from . import evaluator as _evaluator
from .runtime import jinja_ident


class JsUndefined(ChainableUndefined):
    """JS `undefined` (spec/js-undefined-value.md, section 4): the
    Environment's `undefined`, so a var or key that was never set is this
    class natively, and the runtime's own reads (a missing field, an
    out-of-range index, an omitted prop) produce its singleton `UNDEF`.
    Falsy, prints as `""`, chains through attribute and item reads, and is
    neither `none` nor `defined` to Jinja's tests. The engine-free runtime
    recognizes it by its class marker."""

    __slots__ = ()
    _bf_js_undefined = True

    def __repr__(self) -> str:
        return "UNDEF"


UNDEF = JsUndefined()
_evaluator.register_undefined(UNDEF)


def _prepare_for_json(value: Any) -> Any:
    """Recursively replace non-finite floats with `None` so they encode as
    JSON `null` -- matches `JSON.stringify(NaN)` / `JSON.stringify(Infinity)`
    at ANY depth (a strictly more complete carve-out than the Go/Perl
    backends' documented top-level-only handling, and still spec-compliant:
    the template-helpers.md `json` entry only requires the top level).
    Anything else JSON can't encode (cycles, non-serialisable objects) is
    left for `json.dumps` to raise on -- the failure policy mirrors Go/Perl:
    user-data marshalling bubbles errors loudly rather than silently
    producing an empty payload."""
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    # `JSON.stringify` drops a member holding `undefined` and writes an
    # `undefined` element as `null`; `json.dumps` would raise on it.
    if isinstance(value, dict):
        return {k: _prepare_for_json(v) for k, v in value.items() if not _evaluator.is_undefined(v)}
    if isinstance(value, (list, tuple)):
        return [None if _evaluator.is_undefined(v) else _prepare_for_json(v) for v in value]
    return value


def default_json_encoder(data: Any) -> str:
    """`sort_keys=True` keeps key order deterministic (matching the Xslate
    backend's `JSON::PP->canonical` -- see `render.t`'s "canonical key
    order" assertion, ported verbatim in this package's render test).
    `separators=(',', ':')` matches `JSON.stringify`'s compact form."""
    return _json.dumps(
        _prepare_for_json(data), separators=(",", ":"), sort_keys=True, allow_nan=False
    )


class JinjaBackend:
    """Jinja2 rendering backend. Accepts a pre-built `Environment`, or builds
    one from `paths` (a list of template directories) plus optional
    `environment_options`. `json_encoder` overrides the default canonical
    (sorted-key) encoder."""

    def __init__(
        self,
        *,
        env: Optional[Environment] = None,
        paths: Optional[Sequence[str]] = None,
        json_encoder: Optional[Callable[[Any], str]] = None,
        environment_options: Optional[dict] = None,
    ):
        self._json_encoder = json_encoder or default_json_encoder
        if env is not None:
            self._env = env
        else:
            options = dict(environment_options or {})
            options.setdefault("autoescape", True)
            options.setdefault("undefined", JsUndefined)
            # The compile-time adapter (`@barefootjs/jinja`'s
            # `jinja-adapter.ts` file header) documents `trim_blocks=True,
            # lstrip_blocks=True` as part of the render `Environment`'s
            # required contract -- every compiled `.jinja` file places
            # `{% ... %}` control tags on their own source line (including
            # the `{% set _bf_regN = bf.register_script(...) %}` pair every
            # template opens with), and without these two options that
            # line's own newline leaks into the rendered HTML as literal
            # text. This was documented but never actually set here, so the
            # leaked newline silently became a stray space wherever a
            # `render_named`-rendered child (via `bf.render_child`) directly
            # followed TEXT rather than a tag -- e.g. an `AccordionTrigger`'s
            # label immediately followed by its `ChevronDownIcon`. Sitting
            # between two tags it stayed invisible (ordinary whitespace
            # collapse, including this repo's cross-adapter `normalizeHTML`,
            # erases it there), which is why this went unnoticed until
            # #3237's JSX-whitespace fix stopped an unrelated bug from
            # papering over it with a text node of its own. Fulfilling the
            # documented contract here fixes the leak at its source; neither
            # option touches a `{{ ... }}` interpolation's value or newlines
            # inside literal HTML/text content.
            options.setdefault("trim_blocks", True)
            options.setdefault("lstrip_blocks", True)
            self._env = Environment(loader=FileSystemLoader(list(paths or [])), **options)

    @property
    def env(self) -> Environment:
        return self._env

    def encode_json(self, data: Any) -> str:
        return self._json_encoder(data)

    def is_undefined(self, value: Any) -> bool:
        """Whether `value` is Jinja's `Undefined` sentinel (any subclass,
        `JsUndefined` included): a var or key that was never set, which JS
        reads as `undefined`. The runtime's `is_undefined` / `is_nullish`
        accept it, as they do `UNDEF`, so an Environment a host built with
        another `undefined` class still reads its missing vars as JS
        `undefined` there."""
        return isinstance(value, Undefined)

    def mark_raw(self, s: Any) -> Markup:
        """Mark a string as already-safe so Jinja emits it verbatim (no
        auto-escape)."""
        return Markup("" if s is None else s)

    def materialize(self, value: Any) -> Any:
        """JSX children captured by the adapter resolve to a string here.
        Jinja's `{% set children %}...{% endset %}` set-block already
        produces a rendered `Markup` string directly (unlike Mojo's `begin
        %>...<% end`, which yields a CODE ref) -- `materialize` still
        supports a callable for parity with the Perl port's contract and any
        lazy-render composition a caller builds on top of this backend."""
        return value() if callable(value) else value

    def render_named(self, template_name: str, child_bf: Any, variables: Optional[dict]) -> str:
        """Render `<name>.jinja` with `child_bf` bound as the `bf` variable
        for the nested render, plus the supplied template vars. Keyword
        mangling (`jinja_ident`) is applied here -- the one point every
        props dict is turned into template variables -- so a prop literally
        named e.g. `class` or `none` doesn't collide with a Jinja/Python
        reserved word."""
        template = self._env.get_template(f"{template_name}.jinja")
        mangled = {jinja_ident(k): v for k, v in (variables or {}).items()}
        mangled["bf"] = child_bf
        return template.render(**mangled)
