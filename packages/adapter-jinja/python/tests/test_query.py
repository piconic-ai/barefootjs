"""`BarefootJS.query` -- ported from packages/adapter-perl/t/query.t.

The full CROSS-BACKEND behaviour (control flow + form-encoding parity with
the browser's URLSearchParams) is defined ONCE in the shared golden helper
vectors and run by `test_helper_vectors.py`. This file keeps a few
representative cases for always-on coverage plus the Python-runtime-SPECIFIC
defensive behaviour the golden vectors can't express: a `None` value (JSON
has no `undefined`; a JSON `null` stringifies to "null" under JS `String()`,
so it can't be a shared vector -- this runtime coerces `None` to '' and omits
the empty pair, mirroring the Perl port's documented `undef` handling)."""

from __future__ import annotations

import unittest

from barefootjs import BarefootJS


class QueryTest(unittest.TestCase):
    def setUp(self):
        self.bf = BarefootJS(None, {"backend": None})

    def test_order_preserved_repeated_key_overwrites_at_first_position(self):
        self.assertEqual(
            self.bf.query("/blog", True, "sort", "title", True, "tag", "go", True, "sort", "date"),
            "/blog?sort=date&tag=go",
        )

    def test_form_encoding_tilde_star_space(self):
        self.assertEqual(self.bf.query("/s", True, "t", "a~b *c"), "/s?t=a%7Eb+*c")

    def test_array_value_appends_pair_per_nonempty_member(self):
        self.assertEqual(self.bf.query("/list", True, "tag", ["a", "", "b"]), "/list?tag=a&tag=b")

    def test_none_value_coerced_to_empty_and_omitted(self):
        self.assertEqual(self.bf.query("/list", True, "tag", None), "/list")
        self.assertEqual(self.bf.query("/list", True, "tag", None, True, "keep", "me"), "/list?keep=me")


if __name__ == "__main__":
    unittest.main()
