"""Python port of packages/adapter-perl/lib/BarefootJS/SearchParams.pm.

Request-scoped SSR view of the query string behind the reactive
`searchParams()` environment signal. The framework integration builds one
per request from the request URL and threads it into the template scope as
`searchParams` (the camelCase JS name the adapters keep, like every other
signal/prop var); the compiled template reads it via
`{{ searchParams.get('key') }}`.

This runtime is template-engine- and framework-agnostic (stdlib only),
matching the rest of the `barefootjs` package.

Semantics mirror the browser's `URLSearchParams.get` exactly under the
adapters' `?? -> or` lowering: `get()` returns the first value for a key, or
`None` when the key is absent. The Jinja/Python lowering of `??` should
coalesce only `None` (Jinja's `x.get(k) or default` would ALSO coalesce a
present-but-empty string, which is wrong -- the emitter must use
`x.get(k); ... if v is not None else default` shaped logic, not a bare
`or`), preserving the distinction JS `??` draws between `null` and `''`.
"""

from __future__ import annotations

import re
from typing import Optional


def _decode(s: Optional[str]) -> str:
    """Percent/`+`-decode a query-string component, mirroring
    `URLSearchParams`'s `application/x-www-form-urlencoded` parsing. Never
    raises on malformed input (lenient parsing, matching the browser)."""
    if s is None:
        s = ""
    s = s.replace("+", " ")
    raw = bytearray()
    i = 0
    n = len(s)
    while i < n:
        ch = s[i]
        if ch == "%" and i + 2 < n and _is_hex_pair(s[i + 1], s[i + 2]):
            raw.append(int(s[i + 1 : i + 3], 16))
            i += 3
            continue
        raw.extend(ch.encode("utf-8"))
        i += 1
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        # Lenient: a byte run that isn't valid UTF-8 is kept (with
        # replacement chars for the invalid bytes) rather than raising --
        # mirrors Perl's `utf8::decode`, which never dies.
        return raw.decode("utf-8", errors="replace")


def _is_hex_pair(a: str, b: str) -> bool:
    return a in "0123456789ABCDEFabcdef" and b in "0123456789ABCDEFabcdef"


_PAIR_SPLIT_RE = re.compile(r"[&;]")


class SearchParams:
    """new(query=''): parse a raw query string into the reader. A leading
    '?' is tolerated, '+' decodes to a space, and %XX escapes are decoded."""

    def __init__(self, query: str = ""):
        query = query or ""
        if query.startswith("?"):
            query = query[1:]
        values: dict[str, list[str]] = {}
        for pair in _PAIR_SPLIT_RE.split(query):
            if pair == "":
                continue
            if "=" in pair:
                key, val = pair.split("=", 1)
            else:
                key, val = pair, None
            key = _decode(key)
            val_decoded = _decode(val) if val is not None else ""
            values.setdefault(key, []).append(val_decoded)
        self._values = values

    def get(self, key: str) -> Optional[str]:
        """First value for `key`, or `None` when the key is absent. A
        present-but-empty value returns ''."""
        vals = self._values.get(key)
        if not vals:
            return None
        return vals[0]
