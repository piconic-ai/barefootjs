"""BarefootJS.SearchParams -- Python-specific concerns, ported from
packages/adapter-perl/t/search_params.t.

The cross-language VALUE semantics of `get` are owned by the
language-independent golden vectors (`search_params_get` in
`test_helper_vectors.py`), so Go/Perl/Python parity there is mechanical.
This file covers only what those value vectors can't: the lazy factory
seam, lenient parsing (never raises), and UTF-8 decoding.
"""

from __future__ import annotations

import unittest

from barefootjs import BarefootJS, SearchParams


class SearchParamsTest(unittest.TestCase):
    def test_lazy_factory(self):
        sp = BarefootJS.search_params("sort=price")
        self.assertIsInstance(sp, SearchParams)
        self.assertEqual(sp.get("sort"), "price")
        self.assertIsInstance(BarefootJS.search_params(), SearchParams)

    def test_none_composition_coalesces_only_none(self):
        # The adapters lower `searchParams().get(k) ?? d` to a Python
        # expression that coalesces only `None` (not a bare `or`, which
        # would also default a present-but-empty value) -- so an absent key
        # falls back to the author's default while a present-but-empty
        # value keeps ''.
        absent = BarefootJS.search_params("other=x")
        got = absent.get("sort")
        self.assertEqual(got if got is not None else "none", "none")

        empty = BarefootJS.search_params("sort=")
        got = empty.get("sort")
        self.assertEqual(got if got is not None else "none", "")

    def test_utf8_percent_decoding(self):
        sp = BarefootJS.search_params("q=%E2%9C%93")
        self.assertEqual(sp.get("q"), "✓")

    def test_lenient_parsing_never_raises(self):
        BarefootJS.search_params(None)  # should not raise
        self.assertIsNone(BarefootJS.search_params("&&&").get("x"))
        self.assertIsNone(BarefootJS.search_params("=novalue").get("x"))


if __name__ == "__main__":
    unittest.main()
