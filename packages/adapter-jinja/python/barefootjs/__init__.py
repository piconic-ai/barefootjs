"""barefootjs -- Python runtime for the @barefootjs/jinja adapter.

Python port of the Perl `BarefootJS` runtime (`packages/adapter-perl`),
targeting Jinja2 as the template engine (mirroring `packages/adapter-xslate`'s
Text::Xslate backend). Generated `.jinja` templates call the `BarefootJS`
instance as a `bf` object: `{{ bf.scope_attr() }}`, `{{ bf.json(x) }}`,
`{{ bf.spread_attrs(bag) }}`.

Quick start::

    from barefootjs import BarefootJS, JinjaBackend

    backend = JinjaBackend(paths=["templates"])
    bf = BarefootJS(None, {"backend": backend})
    html = backend.render_named("counter", bf, {"count": 0})

Package layout (mirrors the Perl distribution's module layering):

    runtime.py       -- the engine-agnostic `bf` object (port of BarefootJS.pm)
    evaluator.py      -- ParsedExpr evaluator for the `*_eval` helpers
                         (port of BarefootJS/Evaluator.pm)
    search_params.py -- searchParams() SSR reader (port of
                         BarefootJS/SearchParams.pm)
    backend_jinja.py  -- the Jinja2 engine backend (port of
                         BarefootJS::Backend::Xslate)

JS `undefined` and `null` are two values (spec/js-undefined-value.md): host
`None` is JS `null`, and `UNDEF` (a `JsUndefined`, the Environment's
`undefined`) is JS `undefined`. To leave a prop unset, omit its key; pass
`UNDEF` for a prop that is present and `undefined`. `is_undefined`,
`is_null` and `is_nullish` test for them.

Only dependency: `jinja2` (which brings in `markupsafe`). Everything else is
stdlib.

Run the test suite with:

    python3 -m unittest discover -s packages/adapter-jinja/python/tests -t packages/adapter-jinja/python

(equivalently, from `packages/adapter-jinja/python`:
`python3 -m unittest discover -s tests`.)
"""

from .backend_jinja import UNDEF, JinjaBackend, JsUndefined, default_json_encoder
from .evaluator import eval_json, is_null, is_nullish, is_undefined
from .evaluator import evaluate as evaluate_expr
from .runtime import BarefootJS, jinja_ident, js_bool_str, js_number, js_string, js_truthy, mangle_ident
from .search_params import SearchParams

__all__ = [
    "UNDEF",
    "BarefootJS",
    "JinjaBackend",
    "JsUndefined",
    "SearchParams",
    "default_json_encoder",
    "eval_json",
    "evaluate_expr",
    "is_null",
    "is_nullish",
    "is_undefined",
    "jinja_ident",
    "mangle_ident",
    "js_bool_str",
    "js_number",
    "js_string",
    "js_truthy",
]
