"""Python port of packages/adapter-perl/lib/BarefootJS.pm.

Engine- and framework-agnostic server runtime for BarefootJS marked
templates. This module is the server-side runtime the marked templates call
into at render time (as the `bf` object: `{{ bf.scope_attr() }}`,
`{{ bf.json(data) }}`, `{{ bf.spread_attrs(bag) }}`). Every operation that
depends on *how* a template is rendered -- JSON marshalling, raw-string
marking, JSX-children materialisation, and named-template rendering -- is
delegated to a pluggable `backend` (see `backend_jinja.JinjaBackend` for the
Jinja2 implementation), mirroring the Perl runtime's `BarefootJS::Backend::*`
seam.

Method names are kept snake_case and VERBATIM from the Perl runtime
(`render_child`, `scope_attr`, `hydration_attrs`, ...) since the Jinja
adapter's TS emitter generates calls to these exact names.

Divergences from the Perl port (all intentional, all documented at the call
site below):

  * `new`/`__init__` does not lazily fall back to a default framework
    backend (Perl falls back to `BarefootJS::Backend::Mojo`). This Python
    distribution ships exactly one backend (`backend_jinja.JinjaBackend`);
    building runtime.py -> backend_jinja.py would be a circular import, and
    there is no Python analogue of the Perl "reference implementation"
    fallback to fall back to. A host MUST inject a backend via
    `BarefootJS(c, {'backend': backend})`.
  * `c` / `config` / `backend` are plain Python attributes (idiomatic),
    rather than the Perl accessor-base's dual get/set methods. The
    per-render mutable state Perl mutates through dual accessors
    (`_scope_id`, `_bf_parent`, `_bf_mount`, `_props`, `_data_key`,
    `_is_child`, `_scripts`, `_script_seen`, `_child_renderers`) keeps the
    SAME call-as-getter/call-as-setter shape here, because generated render
    scripts and ported tests call them exactly as the Perl harness does
    (`bf._scope_id('Widget_test')`).
  * Perl has no cyclic garbage collector by default, so `register_
    components_from_manifest` weakens its `$parent` capture to avoid a
    per-request reference cycle leak. CPython's garbage collector handles
    reference cycles natively, so the Python port captures `parent` (self)
    directly with no `weakref` dance -- functionally equivalent, no leak.
  * `index_of` / `last_index_of` compare array elements with Python's native
    `==` rather than Perl's `eq` (which stringifies both sides). Python's
    `int`/`float`/`str` are genuinely distinct types (unlike Perl scalars),
    so `==` gives true JS strict-equality behaviour for cross-type probes
    (`2 == "2"` is False) -- this actually ELIMINATES the Perl-documented
    "cross-type probe is strict-equality false" divergence rather than
    reproducing it. (Edge case: Python `bool` is an `int` subclass, so
    `True == 1`, which JS `true === 1` is not; not exercised by the golden
    vectors.) `includes` (#2075) no longer shares this native-`==` path: it
    dispatches through `evaluator._same_value_zero` -- the same
    SameValueZero algorithm the evaluator's serialized-callback `.includes`
    arm uses, so both positions agree, and native `==`'s two remaining gaps
    (NaN never equals itself; `bool` is an `int` subclass) are closed too.
  * Several Perl helpers stringify a value via raw Perl interpolation
    (`"$val"`) rather than routing through `bf->string`. In Python, raw
    `str()` on a float would print `3.0` instead of the JS-correct `"3"`, so
    every internal stringification in this port (query, join, reduce's
    string fold, replace/split/pad/repeat's receiver coercion, ...) goes
    through the same `js_string()` helper that backs the public `string()`
    method -- a uniform policy, not a per-call fix.
  * `spread_attrs`'s boolean-attribute detection uses a plain Python
    `isinstance(val, bool)` check instead of Perl's `JSON::PP::Boolean` /
    `Mojo::JSON::_Bool` sentinel-ref dance -- Python has a real boolean
    type, so no sentinel objects are needed for the "caller MUST pass a
    real boolean for boolean attributes" contract.
  * `truthy` and `mod` do not exist in the Perl runtime; both are added
    per the Python-adapter plan (JS truthiness / JS `%` are needed
    uniformly by the Jinja TS emitter's lowering policy for conditions and
    any `%` operator it emits).
"""

from __future__ import annotations

import datetime
import functools
import math
import re
import uuid
from typing import Any, Callable, Optional

from markupsafe import Markup

from . import evaluator as _evaluator
from .evaluator import looks_like_number, parse_number_literal
from .search_params import SearchParams

# ---------------------------------------------------------------------------
# Keyword mangling (Python/Jinja adapter plan, "Reserved words" divergence
# policy). `jinja_ident` is the canonical name -- it is the exact symbol the
# TS emitter's `packages/adapter-jinja/src/adapter/lib/jinja-naming.ts`
# docstring names as its Python-side counterpart
# (`barefootjs.runtime.jinja_ident`), so the reserved-word set MUST be kept
# in lock-step with that file's `RESERVED_WORDS`. `mangle_ident` is exported
# as an alias for the same function under the more generic name.
# ---------------------------------------------------------------------------

RESERVED_WORDS = frozenset(
    {
        "if", "else", "for", "in", "is", "not", "and", "or", "none", "true", "false",
        "import", "from", "class", "def", "pass", "del", "return", "lambda", "global",
        "with", "as", "raise", "try", "except", "finally", "while", "break",
        "continue", "elif", "yield", "assert", "nonlocal",
    }
)


def jinja_ident(name: str) -> str:
    """Mangle a JS identifier (prop name, signal getter, loop param, ...)
    into a Jinja/Python-safe variable name: reserved words get a trailing
    `_` suffix, everything else passes through unchanged. Applied at every
    point a props dict is turned into template variables (`render_named`,
    `render_child` prop passing) -- see the module divergence notes above."""
    return f"{name}_" if name in RESERVED_WORDS else name


# Alias for the exact name used in the task/plan prose ("a function
# mangle_ident(name)"); `jinja_ident` is the canonical name shared with the
# TS emitter's docstring contract.
mangle_ident = jinja_ident


# ---------------------------------------------------------------------------
# JS-equivalent value stringification / coercion -- free functions so they
# are reusable by the array/string helpers below without needing `self`
# (mirrors the Perl port's free `_pad`, `_style_to_css`, `_to_attr_name`,
# `_form_escape`, `_html_escape` subs).
# ---------------------------------------------------------------------------


def _is_nan(n: float) -> bool:
    return n != n


def _is_inf(n: float) -> bool:
    return n in (float("inf"), float("-inf"))


def _format_js_number(n: float) -> str:
    if n != n:
        return "NaN"
    if n == float("inf"):
        return "Infinity"
    if n == float("-inf"):
        return "-Infinity"
    if n == 0:
        return "0"  # normalises -0.0 to JS's "0" spelling
    if n == int(n) and abs(n) < 1e21:
        return str(int(n))
    return repr(n)  # shortest round-trip; see evaluator._format_number


def js_string(value: Any) -> str:
    """JS `String(v)` mirror, with the SAME `undef` divergence the Perl
    runtime documents: `None` renders as the empty string (not "null") so an
    unset prop doesn't surface as a literal "null"/"undefined" in
    user-facing HTML."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float):
        return _format_js_number(value)
    if isinstance(value, int):
        return str(value)
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        # JS `Array.prototype.toString` == `.join(',')`; never exercised by
        # the golden vectors (they stay scalar-domain) but a reasonable,
        # JS-faithful fallback rather than a Python repr.
        return ",".join("" if v is None else js_string(v) for v in value)
    if isinstance(value, dict):
        return "[object Object]"
    return str(value)


def js_number(value: Any) -> float:
    """JS `Number(v)` mirror, with the SAME deliberate divergence the Perl
    runtime documents: `None` and non-numeric strings yield real NaN (not
    0), so an unset prop / parse failure can't silently zero downstream
    arithmetic."""
    if value is None:
        return float("nan")
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        return parse_number_literal(value) if looks_like_number(value) else float("nan")
    return float("nan")  # list / dict


def _coerce_flat_depth(depth: Any) -> int:
    """JS `ToIntegerOrInfinity` for a dynamic `.flat(depth)` argument
    (#2094), returning an int in `flat`'s own contract (`-1` = unbounded,
    `>= 0` = that many levels). Mirrors Go's `coerceFlatDepth` /
    `flatDepthToFloat`: reuses `js_number` (the module's existing JS
    `Number(v)` mirror -- `None` and non-numeric strings already yield NaN
    there, and `bool` is already checked before the numeric branch, which is
    exactly right here too since Python's `bool` is a subclass of `int`) and
    then applies `ToIntegerOrInfinity`'s NaN/Infinity/truncation rules on
    top: NaN (incl. `None` / non-numeric strings) -> 0; truncate toward
    zero; negative -> 0; +Infinity or a huge finite value -> `-1` (`flat`'s
    "flatten fully" sentinel, matching the golden `flat_dynamic` vectors)."""
    f = js_number(depth)
    if f != f:  # NaN
        return 0
    if f == float("inf"):
        return -1  # flat's "flatten fully" sentinel
    if f == float("-inf"):
        return 0
    trunc = math.trunc(f)
    if trunc < 0:
        return 0
    # A huge finite depth behaves identically to "flatten fully" in
    # practice -- real data bottoms out at its actual nesting depth long
    # before a counter this large would ever reach zero (mirrors Go's cap).
    if trunc > 1_000_000:
        return -1
    return int(trunc)


def js_truthy(value: Any) -> bool:
    """JS truthiness: `[]` / `{}` are truthy; only `None`, `False`, `0`,
    `0.0`, `''`, and NaN are falsy.

    A template-engine "this variable was never bound" sentinel (Jinja's
    `Undefined` under `ChainableUndefined`, e.g. an optional prop a caller
    never passed and that isn't listed in the caller's props dict at all --
    NOT the same as a prop explicitly set to `None`) is not one of the
    isinstance branches below, so it falls through to the final line. It
    must NOT hit the list/dict/tuple `True` short-circuit -- that would make
    `bf.truthy(unset_var)` true, silently flipping every
    `props.optionalFlag`-style condition on an unset prop (`asChild`-style
    branches, `<Slot>` composition, ...) to its truthy branch. Kept
    engine-agnostic (no jinja2 import here -- see the module divergence
    notes): Jinja's `Undefined.__bool__` already returns `False`, matching
    JS's own `Boolean(undefined) === false`, so routing the true catch-all
    through Python's `bool(value)` does the right thing for both an
    unrecognised engine sentinel AND any other unhandled type, while list /
    dict / tuple keep the explicit JS-truthy-even-when-empty override."""
    if value is None or value is False:
        return False
    if value is True:
        return True
    if isinstance(value, (int, float)):
        if isinstance(value, float) and value != value:  # NaN
            return False
        return value != 0
    if isinstance(value, str):
        return value != ""  # incl. the JS-truthy "0"
    if isinstance(value, (list, dict, tuple)):
        return True  # JS objects/arrays are always truthy, even when empty
    return bool(value)


def js_bool_str(value: Any) -> str:
    """Map a boolean-shaped value to the JS `String(bool)` form. Contract is
    boolean-only (mirrors BarefootJS.pm::bool_str): callers must have
    classified the expression as boolean-result before routing through this
    helper; non-boolean attribute bindings stay on the plain interpolation
    path and never reach this function."""
    return "true" if value else "false"


def _scalar_or_empty(value: Any) -> str:
    """String receivers arriving as a list/dict coerce to '' (Perl: `ref($recv)
    ? '' : "$recv"`); anything else (including None) goes through
    `js_string`. Shared by every string-method helper below."""
    if isinstance(value, (list, dict)):
        return ""
    return js_string(value)


# ---------------------------------------------------------------------------
# Context (SSR mirror of the client `provideContext` / `useContext`) -- a
# module-level store (like Perl's package-level `%CONTEXT_STACKS`), not
# per-instance: a parent template and the child templates it renders via
# `render_child` are separate `BarefootJS` instances that don't share one.
# SSR rendering is synchronous, and push/pop are perfectly balanced, so the
# per-name stack always unwinds to empty at the end of each provider
# subtree, keeping concurrent root renders isolated.
# ---------------------------------------------------------------------------

_CONTEXT_STACKS: dict[str, list[Any]] = {}


# ---------------------------------------------------------------------------
# spread_attrs support (JSX intrinsic-element spread, #1407) -- mirrors the
# JS `spreadAttrs` runtime and the Go/Perl adapters' equivalents so SSR
# output stays byte-equal across adapters.
# ---------------------------------------------------------------------------

_SVG_CAMEL_CASE_ATTRS = frozenset(
    {
        "allowReorder", "attributeName", "attributeType", "autoReverse",
        "baseFrequency", "baseProfile", "calcMode", "clipPathUnits",
        "contentScriptType", "contentStyleType", "diffuseConstant", "edgeMode",
        "externalResourcesRequired", "filterRes", "filterUnits", "glyphRef",
        "gradientTransform", "gradientUnits", "kernelMatrix", "kernelUnitLength",
        "keyPoints", "keySplines", "keyTimes", "lengthAdjust", "limitingConeAngle",
        "markerHeight", "markerUnits", "markerWidth", "maskContentUnits",
        "maskUnits", "numOctaves", "pathLength", "patternContentUnits",
        "patternTransform", "patternUnits", "pointsAtX", "pointsAtY", "pointsAtZ",
        "preserveAlpha", "preserveAspectRatio", "primitiveUnits", "refX", "refY",
        "repeatCount", "repeatDur", "requiredExtensions", "requiredFeatures",
        "specularConstant", "specularExponent", "spreadMethod", "startOffset",
        "stdDeviation", "stitchTiles", "surfaceScale", "systemLanguage",
        "tableValues", "targetX", "targetY", "textLength", "viewBox", "viewTarget",
        "xChannelSelector", "yChannelSelector", "zoomAndPan",
    }
)

_CAMEL_TO_KEBAB_RE = re.compile(r"([A-Z])")


def _to_attr_name(key: str) -> str:
    if key == "className":
        return "class"
    if key == "htmlFor":
        return "for"
    if key in _SVG_CAMEL_CASE_ATTRS:
        return key
    # camelCase -> kebab-case, with a leading `-` for an initial uppercase
    # letter (JS-reference parity, even though that case produces an
    # HTML-invalid attribute name -- same documented behaviour as the Go /
    # Perl adapters' `toAttrName` / `_to_attr_name`).
    return _CAMEL_TO_KEBAB_RE.sub(lambda m: "-" + m.group(1).lower(), key)


_FORM_SAFE_BYTES = frozenset(
    b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789*-._ "
)


def _form_escape(s: Any) -> str:
    """application/x-www-form-urlencoded serialisation, matching the
    browser's `URLSearchParams` (which the SSR query render must equal):
    keep ASCII alphanumerics and `* - . _`; encode every other byte as `%XX`
    (UPPER hex); space -> `+`. Non-ASCII is encoded byte-wise over its UTF-8
    bytes."""
    text = js_string(s)
    raw = text.encode("utf-8")
    out: list[str] = []
    for byte in raw:
        if byte in _FORM_SAFE_BYTES:
            out.append(chr(byte))
        else:
            out.append(f"%{byte:02X}")
    return "".join(out).replace(" ", "+")


def _html_escape(value: Any) -> str:
    """HTML attribute-value escape for SSR string emission -- covers `&`,
    `<`, `>`, `"`, `'` (matches Go's `template.HTMLEscapeString` semantics
    byte-for-byte, using `&#34;` / `&#39;` for quotes rather than the named
    entities, so SSR output stays identical across adapters)."""
    s = js_string(value)
    s = s.replace("&", "&amp;")
    s = s.replace("<", "&lt;")
    s = s.replace(">", "&gt;")
    s = s.replace('"', "&#34;")
    s = s.replace("'", "&#39;")
    return s


def _has_unsafe_style_value(value: str) -> bool:
    """Mirrors Hono's own CSS-injection guard (`hono/jsx/utils.ts`'s
    `hasUnsafeStyleValue` -- the ORACLE a dynamic `style={{...}}` value
    must match, #2261): a hand-rolled structural scan for characters that
    could break out of a CSS declaration, NOT real CSSOM property
    validation. Ported character-for-character (codepoint comparisons,
    consistently, throughout -- every tested character is ASCII, so a
    multibyte codepoint can never spuriously match one of these
    single-character comparisons regardless of scan unit). Skips the
    reference implementation's regex fast-path (a pure optimization -- the
    scan below already returns `False` promptly for a clean value)."""
    quote = ""
    block_stack: list[str] = []
    i = 0
    length = len(value)
    while i < length:
        c = value[i]
        if c == "\\":
            if i == length - 1:
                return True
            i += 1
        elif quote:
            if c in ("\n", "\f", "\r"):
                return True
            if c == quote:
                quote = ""
        elif c == "/" and i + 1 < length and value[i + 1] == "*":
            end = value.find("*/", i + 2)
            if end == -1:
                return True
            i = end + 1
        elif c in ('"', "'"):
            quote = c
        elif c == "(":
            block_stack.append(")")
        elif c == "[":
            block_stack.append("]")
        elif c in ("{", "}"):
            return True
        elif c in (")", "]"):
            if not block_stack or block_stack[-1] != c:
                return True
            block_stack.pop()
        elif c == ";" and not block_stack:
            return True
        i += 1
    return bool(quote) or bool(block_stack)


def _style_to_css(value: Any) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, dict):
        # Non-dict values pass through stringified -- matches the JS
        # `typeof value !== 'object'` branch in `styleToCss`.
        s = js_string(value)
        return s if len(s) else None
    parts = []
    for key in sorted(value.keys()):
        v = value[key]
        if v is None:
            continue
        prop = _CAMEL_TO_KEBAB_RE.sub(lambda m: "-" + m.group(1).lower(), key)
        parts.append(f"{prop}:{js_string(v)}")
    return ";".join(parts) if parts else None


def _compare_sort_key(av: Any, bv: Any, compare_type: str) -> int:
    """Compare two projected sort keys, ascending orientation (-1/0/1); the
    caller negates for 'desc'. 'auto' compares numerically when both keys
    look like numbers, else lexically (matches Go/Perl's `bf_sort`). None
    coalesces to '' / 0 so the order stays total."""
    if compare_type == "string":
        a = js_string(av) if av is not None else ""
        b = js_string(bv) if bv is not None else ""
        return -1 if a < b else (1 if a > b else 0)
    if compare_type == "auto":
        if _is_numeric_like(av) and _is_numeric_like(bv):
            an, bn = _numeric_value(av), _numeric_value(bv)
            return -1 if an < bn else (1 if an > bn else 0)
        a = js_string(av) if av is not None else ""
        b = js_string(bv) if bv is not None else ""
        return -1 if a < b else (1 if a > b else 0)
    # numeric
    an = _numeric_value(av) if av is not None else 0.0
    bn = _numeric_value(bv) if bv is not None else 0.0
    return -1 if an < bn else (1 if an > bn else 0)


def _is_numeric_like(v: Any) -> bool:
    if v is None or isinstance(v, bool):
        return False
    if isinstance(v, (int, float)):
        return True
    if isinstance(v, str):
        return looks_like_number(v)
    return False


def _numeric_value(v: Any) -> float:
    if v is None or isinstance(v, (list, dict)):
        return 0.0
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        return parse_number_literal(v) if looks_like_number(v) else 0.0
    return 0.0


# Epoch anchor for `date()`'s `getTime` -- an aware UTC `datetime` so
# subtraction from any other aware `datetime` (any tzinfo) yields the correct
# instant delta regardless of the operand's own offset.
_DATE_EPOCH = datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc)


def _derive_stash_from_defaults(defaults: dict, props: dict) -> dict:
    """Derive template-stash kvs from a manifest entry's `ssrDefaults`
    section. See BarefootJS.pm's `_derive_stash_from_defaults` docstring for
    the full field-shape contract."""
    extra: dict = {}
    for name, d in (defaults or {}).items():
        if not isinstance(d, dict):
            extra[name] = d
            continue
        if d.get("isRestProps"):
            extra[name] = props[name] if name in props else d.get("value")
            continue
        prop_name = d.get("propName")
        if prop_name is not None and props.get(prop_name) is not None:
            extra[name] = props[prop_name]
        else:
            extra[name] = d.get("value")
    return extra


_STRIPPED_TEMPLATE_SUFFIXES = (".html.ep", ".tx", ".jinja")
_MANIFEST_ENTRY_RE = re.compile(r"^ui/([^/]+)/index$")


# ---------------------------------------------------------------------------
# Dual-purpose (get/set) accessor factory -- mirrors the Perl accessor base
# (`for my $attr (qw(...)) { *{"BarefootJS::$attr"} = sub {...} }`): calling
# with no args reads (building the default on first access), calling with
# one positional arg writes and returns `self` for chaining.
# ---------------------------------------------------------------------------


def _dual_accessor(attr: str, default: Any = None) -> Callable:
    def accessor(self: "BarefootJS", *args: Any) -> Any:
        if args:
            self._attrs[attr] = args[0]
            return self
        if attr not in self._attrs:
            self._attrs[attr] = default(self) if callable(default) else default
        return self._attrs.get(attr)

    accessor.__name__ = attr
    return accessor


class BarefootJS:
    """The `bf` object generated Jinja templates call."""

    _scripts = _dual_accessor("_scripts", lambda self: [])
    _script_seen = _dual_accessor("_script_seen", lambda self: {})
    _child_renderers = _dual_accessor("_child_renderers", lambda self: {})
    _is_child = _dual_accessor("_is_child", False)
    _scope_id = _dual_accessor("_scope_id")
    _bf_parent = _dual_accessor("_bf_parent")
    _bf_mount = _dual_accessor("_bf_mount")
    _props = _dual_accessor("_props")
    _data_key = _dual_accessor("_data_key")

    def __init__(self, c: Any = None, config: Optional[dict] = None):
        self._attrs: dict = {}
        self.c = c
        self.config = config or {}
        # See the module divergence notes: no lazy framework-backend
        # fallback (Perl falls back to BarefootJS::Backend::Mojo). A host
        # MUST inject one.
        self.backend = self.config.get("backend")

    # -----------------------------------------------------------------
    # search_params(query='')
    # -----------------------------------------------------------------
    #
    # Build a request-scoped reader for the reactive searchParams()
    # environment signal from a raw query string. Callable as
    # `BarefootJS.search_params(...)` (class-level, mirroring Perl's
    # `BarefootJS->search_params(...)`) or as an instance method.

    @staticmethod
    def search_params(query: str = "") -> SearchParams:
        return SearchParams(query)

    # -----------------------------------------------------------------
    # Scope & Props
    # -----------------------------------------------------------------

    def scope_attr(self) -> str:
        # bf-s is the addressable scope id only (#1249).
        return self._scope_id() or ""

    def hydration_attrs(self) -> str:
        """Emits `bf-h="<host>" bf-m="<slot>" bf-r=""` conditionally. See
        spec/compiler.md "Slot identity"."""
        parts = []
        host = self._bf_parent()
        mount = self._bf_mount()
        if host:
            parts.append(f'bf-h="{js_string(host).replace(chr(34), "&quot;")}"')
        if mount:
            parts.append(f'bf-m="{js_string(mount).replace(chr(34), "&quot;")}"')
        if not self._is_child():
            parts.append('bf-r=""')
        return " ".join(parts)

    def data_key_attr(self) -> str:
        """Emits ` data-key="<key>"` for a keyed loop item, else ''."""
        k = self._data_key()
        if k is None:
            return ""
        k_str = js_string(k).replace("&", "&amp;").replace('"', "&quot;")
        return f' data-key="{k_str}"'

    def props_attr(self) -> str:
        props = self._props()
        if not props:
            return ""
        # The JSON must be attribute-escaped: a raw `'` inside a string value
        # (e.g. a blog paragraph) terminates the single-quoted attribute and
        # truncates the hydration payload. The browser entity-decodes the
        # attribute value, so the client's JSON.parse sees the original text.
        j = _html_escape(self.backend.encode_json(props))
        return f" bf-p='{j}'"

    # -----------------------------------------------------------------
    # Context (SSR mirror of the client `provideContext` / `useContext`)
    # -----------------------------------------------------------------

    def provide_context(self, name: str, value: Any) -> str:
        _CONTEXT_STACKS.setdefault(name, []).append(value)
        return ""

    def revoke_context(self, name: str) -> str:
        stack = _CONTEXT_STACKS.get(name)
        if stack:
            stack.pop()
        return ""

    def use_context(self, name: str, default: Any = None) -> Any:
        stack = _CONTEXT_STACKS.get(name)
        if not stack:
            return default
        return stack[-1]

    # -----------------------------------------------------------------
    # Comment Markers
    # -----------------------------------------------------------------

    def comment(self, text: str) -> str:
        return f"<!--bf-{text}-->"

    # -----------------------------------------------------------------
    # JS-equivalent value stringification
    # -----------------------------------------------------------------

    def bool_str(self, value: Any) -> str:
        return js_bool_str(value)

    def text_start(self, slot_id: str) -> str:
        return f"<!--bf:{slot_id}-->"

    def text_end(self) -> str:
        return "<!--/-->"

    def scope_comment(self) -> str:
        """See spec/compiler.md "Slot identity" for the comment-scope wire
        format."""
        scope_id = self._scope_id() or ""
        host_segment = ""
        host = self._bf_parent()
        mount = self._bf_mount()
        if host:
            host_segment = f"|h={host}|m={mount or ''}"
        props_json = ""
        props = self._props()
        if props:
            props_json = "|" + self.backend.encode_json(props)
        return f"<!--bf-scope:{scope_id}{host_segment}{props_json}-->"

    # -----------------------------------------------------------------
    # Script Registration
    # -----------------------------------------------------------------

    def register_script(self, path: str) -> None:
        seen = self._script_seen()
        if seen.get(path):
            return
        seen[path] = True
        self._scripts().append(path)

    # -----------------------------------------------------------------
    # Child Component Rendering
    # -----------------------------------------------------------------

    def register_child_renderer(self, name: str, renderer: Callable) -> None:
        self._child_renderers()[name] = renderer

    def render_child(self, name: str, *args: Any, **kwargs: Any) -> Any:
        """Renderer contract (#1897): the renderer is invoked with TWO
        arguments -- the props dict and the INVOKING instance. A renderer
        registered on the root may be called from a nested child render, and
        the grandchild's scope/slot identity must chain off the CALLER's
        scope id, not the registrant's.

        Accepts both the kwargs form -- `bf.render_child(name, k=v, ...)` --
        and the single-dict form -- `bf.render_child(name, {'k': v})` -- the
        latter mirroring the Perl port's hashref form for callers that can't
        splat a hash into positional/keyword args."""
        renderer = self._child_renderers().get(name)
        if renderer is None:
            raise RuntimeError(f"No renderer registered for child component '{name}'")
        if len(args) == 1 and isinstance(args[0], dict) and not kwargs:
            props = dict(args[0])
        else:
            props = {}
            it = iter(args)
            for k, v in zip(it, it):
                props[k] = v
            props.update(kwargs)
        # Guard on `in` so a childless invocation doesn't gain a spurious
        # `children: None` key -- preserves the historical "only touch
        # children when present" behaviour.
        if "children" in props:
            props["children"] = self.backend.materialize(props["children"])
        # Keyword mangling applied wherever a props dict becomes template
        # variables -- see the module docstring's divergence notes.
        props = {jinja_ident(k): v for k, v in props.items()}
        return renderer(props, self)

    # -----------------------------------------------------------------
    # Bulk registration from build manifest
    # -----------------------------------------------------------------

    def register_components_from_manifest(
        self, manifest: dict, signal_init: Optional[dict] = None
    ) -> None:
        """`bf build` emits a manifest describing every component the page
        might invoke. This walks that manifest and registers one child
        renderer per UI registry entry -- the path shape `ui/<name>/index`
        maps to the `<name>` slot key the generated template invokes via
        `bf.render_child('<name>', ...)`.

        `signal_init` is an opt-in override dict keyed by slot key
        (`{slot_key: props -> dict}`) for cases the static ssrDefaults
        extractor can't see through."""
        signal_inits = signal_init or {}
        parent_scope = self._scope_id()
        parent = self  # see module divergence notes re: no weakref needed

        for entry_name, entry in (manifest or {}).items():
            # `__barefoot__` is the runtime entry, not a component.
            if entry_name == "__barefoot__":
                continue
            m = _MANIFEST_ENTRY_RE.match(entry_name)
            if not m:
                continue
            slot_key = m.group(1)
            marked = (entry or {}).get("markedTemplate", "") if isinstance(entry, dict) else ""
            if not marked:
                continue
            template_name = marked
            if template_name.startswith("templates/"):
                template_name = template_name[len("templates/") :]
            for suffix in _STRIPPED_TEMPLATE_SUFFIXES:
                if template_name.endswith(suffix):
                    template_name = template_name[: -len(suffix)]
                    break

            signal_init_fn = signal_inits.get(slot_key)
            manifest_defaults = (entry or {}).get("ssrDefaults") if isinstance(entry, dict) else None

            def make_renderer(
                template_name: str = template_name,
                signal_init_fn: Optional[Callable] = signal_init_fn,
                manifest_defaults: Optional[dict] = manifest_defaults,
            ) -> Callable:
                def renderer(props: dict, caller: Optional["BarefootJS"] = None) -> str:
                    host = caller or parent
                    host_scope = host._scope_id() or parent_scope
                    # Child shares the parent's backend so nested renders go
                    # through the same engine.
                    child_bf = BarefootJS(parent.c, {"backend": parent.backend})
                    slot_id = props.pop("_bf_slot", None)
                    # JSX `key` (a reserved prop) -> data-key on the child's
                    # scope root for keyed-loop reconciliation.
                    data_key = props.pop("key", None)
                    if data_key is not None:
                        child_bf._data_key(data_key)
                    if slot_id:
                        child_bf._scope_id(f"{host_scope}_{slot_id}")
                    else:
                        child_bf._scope_id(f"{template_name}_{uuid.uuid4().hex[:6]}")
                    child_bf._is_child(True)
                    # (#1249) Slot identity: host scope + slot id.
                    if slot_id:
                        child_bf._bf_parent(host_scope)
                        child_bf._bf_mount(slot_id)
                    # Share the root registry so the child's own template
                    # can render further imported components (#1897).
                    child_bf._child_renderers(parent._child_renderers())
                    child_bf._scripts(parent._scripts())
                    child_bf._script_seen(parent._script_seen())

                    extra: dict = {}
                    if signal_init_fn:
                        extra = signal_init_fn(props)
                    elif manifest_defaults:
                        extra = _derive_stash_from_defaults(manifest_defaults, props)

                    html = parent.backend.render_named(
                        template_name, child_bf, {**props, **extra}
                    )
                    if isinstance(html, str) and html.endswith("\n"):
                        html = html[:-1]  # chomp: remove at most one trailing newline
                    return html

                return renderer

            self.register_child_renderer(slot_key, make_renderer())

    # -----------------------------------------------------------------
    # Script Output
    # -----------------------------------------------------------------

    def scripts(self) -> str:
        tags = [f'<script type="module" src="{path}"></script>' for path in self._scripts()]
        return "\n".join(tags)

    # -----------------------------------------------------------------
    # Streaming SSR (Out-of-Order)
    # -----------------------------------------------------------------

    def streaming_bootstrap(self) -> str:
        return (
            "<script>(function(){function s(id){"
            "var a=document.querySelector('[bf-async=\"'+id+'\"]');"
            "var t=document.querySelector('template[bf-async-resolve=\"'+id+'\"]');"
            "if(!a||!t)return;"
            "a.replaceChildren(t.content.cloneNode(true));"
            "a.removeAttribute('bf-async');"
            "t.remove();"
            "requestAnimationFrame(function(){if(window.__bf_hydrate)window.__bf_hydrate()})"
            "};window.__bf_swap=s})()</script>"
        )

    def async_boundary(self, id_: str, fallback_html: Any) -> str:
        fallback_html = self.backend.materialize(fallback_html)
        return f'<div bf-async="{id_}">{fallback_html}</div>'

    def async_resolve(self, id_: str, content_html: Any) -> str:
        return f'<template bf-async-resolve="{id_}">{content_html}</template><script>__bf_swap("{id_}")</script>'

    # -----------------------------------------------------------------
    # JS-compat callees (#1189) -- invoked from generated Jinja templates as
    # `{{ bf.json(val) }}`, `{{ bf.floor(val) }}`, etc.
    # -----------------------------------------------------------------

    def json(self, value: Any) -> str:
        return self.backend.encode_json(value)

    def string(self, value: Any) -> str:
        return js_string(value)

    def number(self, value: Any) -> float:
        return js_number(value)

    def truthy(self, value: Any) -> bool:
        return js_truthy(value)

    def mod(self, a: Any, b: Any) -> float:
        """JS `%`: remainder with the dividend's sign. Python's `math.fmod`
        implements the same C-style fmod semantics as JS `%` for finite
        operands (sign-of-dividend remainder); domain errors (zero divisor,
        infinite dividend) map to NaN, matching JS."""
        an, bn = js_number(a), js_number(b)
        try:
            return math.fmod(an, bn)
        except (ValueError, OverflowError):
            return float("nan")

    def floor(self, value: Any) -> float:
        n = js_number(value)
        if _is_nan(n) or _is_inf(n):
            return n
        return float(math.floor(n))

    def ceil(self, value: Any) -> float:
        n = js_number(value)
        if _is_nan(n) or _is_inf(n):
            return n
        return float(math.ceil(n))

    def round(self, value: Any) -> float:
        n = js_number(value)
        if _is_nan(n) or _is_inf(n):
            return n
        # JS `Math.round` rounds half toward +Infinity (`Math.round(-1.5)`
        # is -1, not -2). `floor(n + 0.5)` reproduces that for both signs.
        return float(math.floor(n + 0.5))

    def min(self, a: Any, b: Any) -> float:
        """`Math.min(a, b)` -- two-arg form only (#2168 math-methods).
        JS returns NaN if either operand is NaN."""
        x, y = js_number(a), js_number(b)
        if _is_nan(x):
            return x
        if _is_nan(y):
            return y
        return x if x < y else y

    def max(self, a: Any, b: Any) -> float:
        x, y = js_number(a), js_number(b)
        if _is_nan(x):
            return x
        if _is_nan(y):
            return y
        return x if x > y else y

    def abs(self, value: Any) -> float:
        """`Math.abs()` (#2168 math-methods)."""
        n = js_number(value)
        return n if _is_nan(n) else abs(n)

    def date(self, recv: Any, op: str) -> Any:
        """`date(recv, op)` -- zero-arg `Date.prototype` method lowering
        (#2274, spec entry "date"). `recv` arrives as either this runtime's
        own `datetime` or an ISO-8601 string (a template prop may carry
        either depending on how the host populated it). A naive `datetime`
        is treated as already-UTC (this runtime never produces one); an
        aware one converts via `astimezone` so a non-UTC-offset input still
        dispatches against the right instant. `.month` is 1-based in
        Python; only `getUTCMonth` subtracts 1 to match JS's 0-based month.
        `getTime` divides the exact `timedelta` from the epoch by a 1ms
        `timedelta` (floor division on an exact `timedelta` ratio) rather
        than rounding a float ms value, so a pre-epoch instant stays
        exact."""
        if isinstance(recv, datetime.datetime):
            dt = recv
        else:
            # `fromisoformat` only learned the bare `Z` suffix in 3.11 but
            # accepts an explicit `+00:00` offset since 3.7, so a `>=3.10`
            # install parses the same string once rewritten. A nil or
            # unparseable receiver degrades to the zero value the Go / Rust
            # / Perl helpers document, not a render-time crash.
            s = str(recv)
            if s.endswith("Z"):
                s = s[:-1] + "+00:00"
            try:
                dt = datetime.datetime.fromisoformat(s)
            except ValueError:
                return "" if op == "toISOString" else 0
        dt = dt.replace(tzinfo=datetime.timezone.utc) if dt.tzinfo is None else dt.astimezone(datetime.timezone.utc)
        if op == "getUTCFullYear":
            return dt.year
        if op == "getUTCMonth":
            return dt.month - 1
        if op == "getUTCDate":
            return dt.day
        if op == "getUTCHours":
            return dt.hour
        if op == "getUTCMinutes":
            return dt.minute
        if op == "getUTCSeconds":
            return dt.second
        if op == "getTime":
            return (dt - _DATE_EPOCH) // datetime.timedelta(milliseconds=1)
        if op == "toISOString":
            return (
                f"{dt.year:04d}-{dt.month:02d}-{dt.day:02d}T"
                f"{dt.hour:02d}:{dt.minute:02d}:{dt.second:02d}."
                f"{dt.microsecond // 1000:03d}Z"
            )
        return 0

    # -----------------------------------------------------------------
    # Array / String method helpers (#1448 Tier A)
    # -----------------------------------------------------------------

    def includes(self, recv: Any, elem: Any) -> bool:
        # `Array.prototype.includes(x)` + `String.prototype.includes(sub)`
        # lower to the same `bf.includes(recv, elem)` shape -- see #1448
        # Tier A. Dispatch on `recv`'s Python type: a `list` scans elements
        # with `evaluator._same_value_zero` (#2075) -- SameValueZero
        # membership, matching `Array.prototype.includes`'s semantics (no
        # cross-type coercion, e.g. `[2].includes("2")` is false; NaN
        # matches NaN) and the evaluator's serialized-callback `.includes`
        # arm, so both positions agree. A `dict` (JS has no `.includes` on
        # plain objects) and anything else falls through to the string
        # branch: substring search via `js_string` coercion.
        if isinstance(recv, list):
            return any(_evaluator._same_value_zero(item, elem) for item in recv)
        if isinstance(recv, dict):
            return False
        s = js_string(recv)
        e = js_string(elem)
        return e in s

    def filter(self, recv: Any, pred: Callable[[Any], Any]) -> list:
        if not isinstance(recv, list):
            return []
        return [x for x in recv if pred(x)]

    def every(self, recv: Any, pred: Callable[[Any], Any]) -> bool:
        if not isinstance(recv, list):
            return True
        return all(pred(x) for x in recv)

    def some(self, recv: Any, pred: Callable[[Any], Any]) -> bool:
        if not isinstance(recv, list):
            return False
        return any(pred(x) for x in recv)

    def find(self, recv: Any, pred: Callable[[Any], Any]) -> Any:
        if not isinstance(recv, list):
            return None
        for item in recv:
            if pred(item):
                return item
        return None

    def find_index(self, recv: Any, pred: Callable[[Any], Any]) -> int:
        if not isinstance(recv, list):
            return -1
        for i, item in enumerate(recv):
            if pred(item):
                return i
        return -1

    def find_last(self, recv: Any, pred: Callable[[Any], Any]) -> Any:
        if not isinstance(recv, list):
            return None
        for item in reversed(recv):
            if pred(item):
                return item
        return None

    def find_last_index(self, recv: Any, pred: Callable[[Any], Any]) -> int:
        if not isinstance(recv, list):
            return -1
        for i in range(len(recv) - 1, -1, -1):
            if pred(recv[i]):
                return i
        return -1

    def style_object(self, *pairs: Any) -> Markup:
        """Builds the CSS string for a `style={{...}}` JSX object-literal
        attribute (#2261) -- `pairs` alternates CSS key (always a
        compile-time-known literal), then value. A value that fails
        `_has_unsafe_style_value` (after JS-`String()`-style
        stringification) is DROPPED -- the whole `key:value` pair is
        omitted -- matching Hono's oracle behavior exactly. The final
        joined string is STILL HTML-escaped (mirroring Hono's own
        `escapeToBuffer` call on its accumulated style string) -- a "safe"
        value can still carry a literal `"`/`'`/`&` (e.g. a BALANCED-quote
        CSS string value like `"hello"` passes the structural scan) that
        would otherwise break out of the double-quoted `style="..."`
        attribute. Returns `Markup` so Jinja's autoescape treats the
        (already-escaped) result as safe instead of double-escaping it."""
        parts = []
        for i in range(0, len(pairs) - 1, 2):
            key, value = pairs[i], pairs[i + 1]
            v = js_string(value)
            if _has_unsafe_style_value(v):
                continue
            parts.append(f"{_html_escape(key)}:{_html_escape(v)}")
        return Markup(";".join(parts))

    def lc(self, s: Any) -> str:
        return js_string(s).lower()

    def uc(self, s: Any) -> str:
        return js_string(s).upper()

    def join(self, recv: Any, sep: Optional[str] = None) -> str:
        if not isinstance(recv, list):
            return ""
        sep = "," if sep is None else sep
        return sep.join(js_string(x) for x in recv)

    def length(self, recv: Any) -> int:
        if isinstance(recv, list):
            return len(recv)
        if isinstance(recv, dict):
            return 0
        # JS `String.prototype.length` counts UTF-16 CODE UNITS, not
        # Python's codepoint-counting `len(str)` (#2255). A codepoint
        # outside the Basic Multilingual Plane (astral, U+10000-U+10FFFF —
        # e.g. '👍') is a surrogate PAIR in UTF-16, so it counts as 2, not
        # 1; '日本語' is 3 either way (BMP-only).
        return sum(2 if ord(c) > 0xFFFF else 1 for c in js_string(recv))

    def index_of(self, recv: Any, elem: Any) -> int:
        return _array_index_of(recv, elem, reverse=False)

    def last_index_of(self, recv: Any, elem: Any) -> int:
        return _array_index_of(recv, elem, reverse=True)

    def at(self, recv: Any, i: Any) -> Any:
        if not isinstance(recv, list) or i is None:
            return None
        length = len(recv)
        if length == 0:
            return None
        idx = length + i if i < 0 else i
        if idx < 0 or idx >= length:
            return None
        return recv[idx]

    def concat(self, a: Any, b: Any) -> list:
        out: list = []
        if isinstance(a, list):
            out.extend(a)
        if isinstance(b, list):
            out.extend(b)
        return out

    def slice(self, recv: Any, start: Any, end: Any) -> Any:
        # `Array.prototype.slice(start, end?)` AND `String.prototype.slice`
        # (the `string-slice` divergence, #2182) -- the adapter emits the
        # same `bf.slice(recv, start, end)` call for both receiver shapes
        # (it can't disambiguate string vs. array at compile time), so
        # this dispatches on the Python type, mirroring `includes` above.
        # `str` and `list` share slicing semantics (`recv[s:e]`) and
        # `len()`, so one clamp computation serves both; `str` indexing
        # is by Unicode code point already, matching JS except for
        # astral-plane input (the same divergence boundary every other
        # adapter's pad/trim helpers already accept).
        if not isinstance(recv, (list, str)):
            return []
        length = len(recv)
        s = start if start is not None else 0
        if s < 0:
            s = length + s
        s = max(s, 0)
        s = min(s, length)
        e = end if end is not None else length
        if e < 0:
            e = length + e
        e = max(e, 0)
        e = min(e, length)
        if s >= e:
            return recv[0:0]
        return recv[s:e] if isinstance(recv, str) else list(recv[s:e])

    def reverse(self, recv: Any) -> list:
        if not isinstance(recv, list):
            return []
        return list(reversed(recv))

    def flat(self, recv: Any, depth: int = 1) -> list:
        if not isinstance(recv, list):
            return []
        out: list = []
        for el in recv:
            if depth != 0 and isinstance(el, list):
                nxt = depth - 1 if depth > 0 else depth
                out.extend(self.flat(el, nxt))
            else:
                out.append(el)
        return out

    def flat_dynamic(self, recv: Any, depth: Any) -> list:
        """`.flat(depth)` where `depth` is itself an arbitrary expression
        (#2094), e.g. a prop -- as opposed to `flat`'s compile-time-literal
        `depth` (whose `-1` is a SENTINEL baked into the template source
        meaning "the source literally said `Infinity`"). A dynamic `depth`
        value that happens to evaluate to `-1` at render time means the
        OPPOSITE in real JS (`[1,[2]].flat(-1)` never recurses -- same as
        `.flat(0)`), so this is deliberately a separate entry point rather
        than a smarter overload of `flat`: coerce `depth` via JS
        `ToIntegerOrInfinity` (truncate toward zero; negative -> 0; NaN /
        non-numeric -> 0; +Infinity or a huge finite value -> flatten fully,
        represented as `flat`'s `-1` sentinel) and delegate to `flat` with
        the now-unambiguous coerced int. Mirrors Go's
        `FlatDynamicDepth`/`coerceFlatDepth`."""
        return self.flat(recv, _coerce_flat_depth(depth))

    def flat_map(self, recv: Any, key_kind: str, key: str) -> list:
        if not isinstance(recv, list):
            return []
        projected = []
        for el in recv:
            if key_kind == "field":
                projected.append(el.get(key) if isinstance(el, dict) else None)
            else:
                projected.append(el)
        return self.flat(projected, 1)

    def flat_map_tuple(self, recv: Any, *specs: tuple) -> list:
        if not isinstance(recv, list):
            return []
        out: list = []
        for el in recv:
            for kind, key in specs:
                if kind == "field":
                    out.append(el.get(key) if isinstance(el, dict) else None)
                else:
                    out.append(el)
        return out

    def trim(self, recv: Any) -> str:
        if recv is None or isinstance(recv, (list, dict)):
            return ""
        return js_string(recv).strip()

    def trim_start(self, recv: Any) -> str:
        """`String.prototype.trimStart()` -- the one-sided sibling of `trim`
        above (#2183 follow-up)."""
        if recv is None or isinstance(recv, (list, dict)):
            return ""
        return js_string(recv).lstrip()

    def trim_end(self, recv: Any) -> str:
        """`String.prototype.trimEnd()` -- the one-sided sibling of `trim`
        above (#2183 follow-up)."""
        if recv is None or isinstance(recv, (list, dict)):
            return ""
        return js_string(recv).rstrip()

    def to_fixed(self, value: Any, digits: int = 0) -> str:
        n = self.number(value)
        if _is_nan(n):
            return "NaN"
        if _is_inf(n):
            return "-Infinity" if n < 0 else "Infinity"
        if digits is None or digits < 0:
            digits = 0
        digits = int(digits)
        factor = 10**digits
        rounded = math.floor(n * factor + 0.5)
        return f"{rounded / factor:.{digits}f}"

    def split(self, recv: Any, sep: Optional[Any] = None, limit: Optional[int] = None) -> list:
        s = _scalar_or_empty(recv)
        if sep is None:
            parts = [s]
        elif js_string(sep) == "":
            parts = list(s)
        elif s == "":
            parts = [""]
        else:
            parts = s.split(js_string(sep))
        if limit is not None:
            n = int(limit)
            if n == 0:
                parts = []
            elif n > 0 and n < len(parts):
                parts = parts[:n]
        return parts

    def starts_with(self, recv: Any, prefix: Any, position: Optional[Any] = None) -> bool:
        s = _scalar_or_empty(recv)
        p = js_string(prefix)
        if position is not None:
            n = max(0, min(int(position), len(s)))
            s = s[n:]
        return s.startswith(p)

    def ends_with(self, recv: Any, suffix: Any, end_position: Optional[Any] = None) -> bool:
        s = _scalar_or_empty(recv)
        x = js_string(suffix)
        if end_position is not None:
            e = max(0, min(int(end_position), len(s)))
            s = s[:e]
        if x == "":
            return True
        if len(s) < len(x):
            return False
        return s[-len(x) :] == x

    def replace(self, recv: Any, pattern: Any, replacement: Any) -> str:
        s = _scalar_or_empty(recv)
        o = js_string(pattern)
        n = js_string(replacement)
        if o == "":
            return n + s
        i = s.find(o)
        if i < 0:
            return s
        return s[:i] + n + s[i + len(o) :]

    def replace_all(self, recv: Any, pattern: Any, replacement: Any) -> str:
        """`String.prototype.replaceAll(pattern, replacement)`, string-pattern
        form only (#2182) -- every occurrence, the all-occurrences sibling of
        `replace` above. Python's own `str.replace(old, new)` (no count arg)
        is already global by default, including the empty-pattern-inserts-
        at-every-boundary edge case (`"abc".replace("", "X")` -> "XaXbXcX"),
        so it needs no hand-rolled loop the way the other runtimes' first-
        occurrence-only native replace does."""
        s = _scalar_or_empty(recv)
        o = js_string(pattern)
        n = js_string(replacement)
        return s.replace(o, n)

    def query(self, base: Any, *triples: Any) -> str:
        """`queryHref(base, {...})` (#2042) -- build `"$base?k=v&..."` from a
        flat list of (guard, key, value) triples. A pair is included iff its
        guard is JS-truthy AND its value is a non-empty string. A value may
        also be a list, appending one pair per non-empty member. Repeating a
        key overwrites the value at its first position."""
        b = _scalar_or_empty(base)
        pairs: list[tuple[str, str]] = []
        pos: dict[str, int] = {}
        items = list(triples)
        i = 0
        while i + 2 < len(items):
            guard, key, val = items[i], items[i + 1], items[i + 2]
            i += 3
            if not self.truthy(guard):
                continue
            key_s = _scalar_or_empty(key)
            if isinstance(val, list):
                for m in val:
                    s = _scalar_or_empty(m)
                    if s == "":
                        continue
                    pairs.append((key_s, s))
                continue
            val_s = _scalar_or_empty(val)
            if val_s == "":
                continue
            if key_s in pos:
                pairs[pos[key_s]] = (key_s, val_s)
            else:
                pos[key_s] = len(pairs)
                pairs.append((key_s, val_s))
        if not pairs:
            return b
        return b + "?" + "&".join(f"{_form_escape(k)}={_form_escape(v)}" for k, v in pairs)

    def repeat(self, recv: Any, count: Any) -> str:
        s = _scalar_or_empty(recv)
        n = int(count) if count is not None else 0
        return s * n if n > 0 else ""

    def pad_start(self, recv: Any, target: Any, pad: Optional[Any] = None) -> str:
        return _pad(_scalar_or_empty(recv), target, pad, at_start=True)

    def pad_end(self, recv: Any, target: Any, pad: Optional[Any] = None) -> str:
        return _pad(_scalar_or_empty(recv), target, pad, at_start=False)

    # -----------------------------------------------------------------
    # Array.prototype.sort(cmp) / toSorted(cmp) -- structured comparator
    # dispatch (#1448 Tier B). `opts['keys']` is a priority-ordered list of
    # per-key dicts: key_kind ('self'|'field'), key, compare_type
    # ('numeric'|'string'|'auto'), direction ('asc'|'desc').
    # -----------------------------------------------------------------

    def sort(self, recv: Any, opts: Optional[dict] = None) -> list:
        if not isinstance(recv, list):
            return []
        opts = opts or {}
        spec = [
            {
                "key_kind": k.get("key_kind", "self"),
                "key": k.get("key", ""),
                "compare_type": k.get("compare_type", "numeric"),
                "direction": k.get("direction", "asc"),
            }
            for k in (opts.get("keys") or [])
        ]
        if not spec:
            return list(recv)

        keyed = []
        for item in recv:
            ks = []
            for s in spec:
                if s["key_kind"] == "field" and isinstance(item, dict):
                    ks.append(item.get(s["key"]))
                else:
                    ks.append(item)
            keyed.append((ks, item))

        def cmp(a: tuple, b: tuple) -> int:
            for i, s in enumerate(spec):
                c = _compare_sort_key(a[0][i], b[0][i], s["compare_type"])
                if c == 0:
                    continue
                return -c if s["direction"] == "desc" else c
            return 0

        ordered = sorted(keyed, key=functools.cmp_to_key(cmp))
        return [item for _, item in ordered]

    def reduce(self, recv: Any, opts: Optional[dict] = None) -> Any:
        """Fold via the arithmetic-fold catalogue (#1448 Tier C). Mirrors
        `Array.prototype.reduce` / `.reduceRight` for the shapes `(acc, x) =>
        acc <op> x` / `(acc, x) => acc <op> x.field`."""
        opts = opts or {}
        op = opts.get("op", "+")
        key_kind = opts.get("key_kind", "self")
        key = opts.get("key", "")
        rtype = opts.get("type", "numeric")
        direction = opts.get("direction", "left")

        items = list(recv) if isinstance(recv, list) else []
        if direction == "right":
            items = list(reversed(items))

        def project(item: Any) -> Any:
            return item.get(key) if key_kind == "field" and isinstance(item, dict) else item

        if rtype == "string":
            acc = opts.get("init")
            acc = "" if acc is None else acc
            for item in items:
                acc += self.string(project(item))
            return acc

        acc = opts.get("init")
        acc = 0 if acc is None else acc
        for item in items:
            val = project(item)
            n = _numeric_value(val) if val is not None and _is_numeric_like(val) else 0
            acc = acc * n if op == "*" else acc + n
        return acc

    # -----------------------------------------------------------------
    # JSX intrinsic-element spread (#1407)
    # -----------------------------------------------------------------

    def spread_attrs(self, bag: Any) -> Any:
        if not isinstance(bag, dict):
            return ""
        parts = []
        for key in sorted(bag.keys()):
            # Event handlers: skip when key starts `on` and the third
            # character is its own uppercase form.
            if len(key) > 2 and key[:2] == "on":
                c = key[2]
                if c.upper() == c:
                    continue
            if key == "children":
                continue
            val = bag.get(key)
            if val is None:
                continue
            if isinstance(val, bool):
                if val:
                    parts.append(_to_attr_name(key))
                continue
            if key == "style":
                css = _style_to_css(val)
                if not css:
                    continue
                parts.append(f'style="{_html_escape(css)}"')
                continue
            name = _to_attr_name(key)
            parts.append(f'{name}="{_html_escape(val)}"')
        if not parts:
            return ""
        return self.backend.mark_raw(" ".join(parts))

    # -----------------------------------------------------------------
    # Loop-destructure object-rest residual object (#2087 Phase B)
    # -----------------------------------------------------------------

    def omit(self, recv: Any, keys: Any) -> dict:
        """Shallow copy of `recv` with `keys` removed -- the TRUE residual
        dict for an object-rest `.map()` callback binding
        (`{ id, title, ...rest }` -> `{% set rest = bf.omit(item, ['id',
        'title']) %}`), so `rest.flag` member reads and
        `bf.spread_attrs(rest)` (forwarding `{...rest}` onto an element)
        both see exactly the sibling keys NOT already destructured -- never
        the whole item. Mirrors `spread_attrs`'s defensive non-dict
        handling: a non-dict `recv` yields `{}` rather than raising.
        """
        if not isinstance(recv, dict):
            return {}
        exclude = set(keys) if keys else set()
        return {k: v for k, v in recv.items() if k not in exclude}

    # -----------------------------------------------------------------
    # Evaluator-driven sort / reduce / higher-order predicates (#2018):
    # the comparator / reducer / predicate body rides as a
    # serialized-ParsedExpr JSON string and is evaluated per element,
    # delegating to the shared `evaluator` module.
    # -----------------------------------------------------------------

    def sort_eval(
        self, recv: Any, cmp_json: str, param_a: str, param_b: str, base_env: Optional[dict] = None
    ) -> list:
        return _evaluator.sort_by_json(recv, cmp_json, param_a, param_b, base_env or {})

    def reduce_eval(
        self,
        recv: Any,
        body_json: str,
        acc_name: str,
        item_name: str,
        init: Any,
        direction: str = "left",
        base_env: Optional[dict] = None,
    ) -> Any:
        return _evaluator.fold_json(recv, body_json, acc_name, item_name, init, direction, base_env or {})

    def filter_eval(self, recv: Any, pred_json: str, param: str, base_env: Optional[dict] = None) -> list:
        return _evaluator.filter_json(recv, pred_json, param, base_env or {})

    def every_eval(self, recv: Any, pred_json: str, param: str, base_env: Optional[dict] = None) -> bool:
        return _evaluator.every_json(recv, pred_json, param, base_env or {})

    def some_eval(self, recv: Any, pred_json: str, param: str, base_env: Optional[dict] = None) -> bool:
        return _evaluator.some_json(recv, pred_json, param, base_env or {})

    def find_eval(
        self, recv: Any, pred_json: str, param: str, forward: bool = True, base_env: Optional[dict] = None
    ) -> Any:
        return _evaluator.find_json(recv, pred_json, param, forward, base_env or {})

    def find_index_eval(
        self, recv: Any, pred_json: str, param: str, forward: bool = True, base_env: Optional[dict] = None
    ) -> int:
        return _evaluator.find_index_json(recv, pred_json, param, forward, base_env or {})

    def flat_map_eval(self, recv: Any, proj_json: str, param: str, base_env: Optional[dict] = None) -> list:
        return _evaluator.flat_map_json(recv, proj_json, param, base_env or {})

    def map_eval(self, recv: Any, proj_json: str, param: str, base_env: Optional[dict] = None) -> list:
        return _evaluator.map_json(recv, proj_json, param, base_env or {})


def _array_index_of(recv: Any, elem: Any, reverse: bool) -> int:
    if not isinstance(recv, list):
        return -1
    idxs = range(len(recv) - 1, -1, -1) if reverse else range(len(recv))
    for i in idxs:
        item = recv[i]
        if item is None:
            if elem is None:
                return i
            continue
        if elem is not None and item == elem:
            return i
    return -1


def _pad(s: str, target: Any, pad: Optional[Any], at_start: bool) -> str:
    p = " " if pad is None else js_string(pad)
    if p == "":
        return s
    length = len(s)
    t = int(target) if target is not None else 0
    if length >= t:
        return s
    need = t - length
    reps = need // len(p) + 1
    fill = (p * reps)[:need]
    return fill + s if at_start else s + fill
