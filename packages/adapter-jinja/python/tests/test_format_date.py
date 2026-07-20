"""`format_date` tz error contract (#2344).

Canonical IANA zone names resolve through tzdata (`zoneinfo`); an
unresolvable ``tz`` raises ValueError — the loud-not-silent replacement
for the pre-#2344 normalize-to-UTC total function. The resolvable grid is
pinned by the golden vectors (test_helper_vectors.py); this suite pins the
error side, which is outside the vector domain (spec/template-helpers.md
JS-throws rule).
"""

from __future__ import annotations

import unittest

from barefootjs.runtime import BarefootJS


class _PureBackend:
    def mark_raw(self, s):
        return s


bf = BarefootJS(None, {"backend": _PureBackend()})

RECV = "2024-01-01T23:00:00.000Z"


class FormatDateTzTest(unittest.TestCase):
    def test_unresolvable_time_zones_raise(self) -> None:
        for tz in ["garbage", "Asia/Tokyoo", "+9:00", "+25:00", "asia/tokyo", "Local", ""]:
            with self.subTest(tz=tz):
                with self.assertRaises(ValueError):
                    bf.format_date(RECV, "YYYY-MM-DD", tz)

    def test_receiver_contract_precedes_tz_validation(self) -> None:
        # nil / unparseable receivers render '' without inspecting tz.
        self.assertEqual(bf.format_date(None, "YYYY-MM-DD", "garbage"), "")
        self.assertEqual(bf.format_date("not a date", "YYYY-MM-DD", "garbage"), "")

    def test_named_zone_happy_path(self) -> None:
        # Redundant with the golden vectors, but keeps this file
        # self-sufficient outside the monorepo checkout.
        self.assertEqual(bf.format_date(RECV, "YYYY-MM-DD", "Asia/Tokyo"), "2024-01-02")


if __name__ == "__main__":
    unittest.main()
