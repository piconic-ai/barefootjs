"""`BarefootJS.omit` -- the object-rest `.map()` destructure residual-object
helper (#2087 Phase B). Companion to `test_spread_attrs.py`: `omit` builds
the TRUE residual dict (`{ id, title, ...rest }` -> `bf.omit(item, ['id',
'title'])`) that `rest.flag` member reads and `bf.spread_attrs(rest)`
forwarding both read from.
"""

from __future__ import annotations

import unittest

from barefootjs import BarefootJS


class _PureBackend:
    def mark_raw(self, s):
        return s


def run(recv, keys):
    bf = BarefootJS(None, {"backend": _PureBackend()})
    return bf.omit(recv, keys)


class OmitTest(unittest.TestCase):
    def test_basic_shape(self):
        self.assertEqual(
            run({"id": "t1", "title": "one", "flag": "a"}, ["id", "title"]),
            {"flag": "a"},
        )

    def test_no_keys_excluded(self):
        self.assertEqual(run({"a": 1, "b": 2}, []), {"a": 1, "b": 2})

    def test_all_keys_excluded(self):
        self.assertEqual(run({"a": 1, "b": 2}, ["a", "b"]), {})

    def test_non_identifier_key(self):
        # The rest-spread fixture's residual carries a non-identifier
        # sibling key (`data-priority`) through untouched.
        self.assertEqual(
            run(
                {"id": "t1", "title": "one", "data-priority": "high", "tag": "urgent"},
                ["id", "title"],
            ),
            {"data-priority": "high", "tag": "urgent"},
        )

    def test_non_dict_input(self):
        self.assertEqual(run(None, ["id"]), {})
        self.assertEqual(run("not a dict", ["id"]), {})
        self.assertEqual(run([1, 2, 3], ["id"]), {})

    def test_key_not_present_is_noop(self):
        self.assertEqual(run({"a": 1}, ["missing"]), {"a": 1})

    def test_empty_keys_arg(self):
        self.assertEqual(run({"a": 1}, None), {"a": 1})


if __name__ == "__main__":
    unittest.main()
