"""`BarefootJS.props_attr` -- the `bf-p` hydration-payload attribute.

The encoded JSON is embedded in a SINGLE-quoted attribute, so it must be
attribute-escaped: a raw `'` inside a string value (e.g. a blog paragraph)
terminates the attribute early and the client hydrates from truncated JSON
(empty island text; found via the shared blog-ssr e2e). Same fix across the
Perl, Python, Ruby, and Rust runtimes -- keep the four tests in sync.
"""

from __future__ import annotations

import json
import re
import unittest

from barefootjs import BarefootJS


class _PureBackend:
    def encode_json(self, value):
        return json.dumps(value, sort_keys=True, separators=(",", ":"))


def bf_with(props):
    bf = BarefootJS(None, {"backend": _PureBackend()})
    if props is not None:
        bf._props(props)
    return bf


class PropsAttrTest(unittest.TestCase):
    def test_empty_props_emit_nothing(self):
        self.assertEqual(bf_with(None).props_attr(), "")
        self.assertEqual(bf_with({}).props_attr(), "")

    def test_json_is_attribute_escaped(self):
        attr = bf_with({"note": "it's <b> & co"}).props_attr()
        self.assertEqual(attr, " bf-p='{&#34;note&#34;:&#34;it&#39;s &lt;b&gt; &amp; co&#34;}'")

    def test_attribute_round_trips_through_entity_decoding(self):
        attr = bf_with({"note": "it's <b> & co"}).props_attr()
        value = re.search(r"bf-p='([^']*)'", attr).group(1)
        decoded = (
            value.replace("&#34;", '"')
            .replace("&#39;", "'")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&amp;", "&")
        )
        self.assertEqual(json.loads(decoded), {"note": "it's <b> & co"})


if __name__ == "__main__":
    unittest.main()
