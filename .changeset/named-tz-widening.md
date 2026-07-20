---
'@barefootjs/client': minor
'@barefootjs/jsx': minor
'@barefootjs/erb': minor
'@barefootjs/go-template': minor
'@barefootjs/php': minor
'@barefootjs/perl': minor
'@barefootjs/jinja': minor
'@barefootjs/rust': minor
---

`formatDate` / `format_date` timeZone widens to canonical IANA zone IDs (#2344): `'Asia/Tokyo'`-style zones resolve through each backend's tzdata at the instant being formatted (DST-aware, seconds-precision LMT included), and the literal-locale `toLocaleDateString` sugar admits a named-zone literal the build machine's Intl probe verifies. Breaking contract change: an unresolvable timeZone (unknown zone, non-canonical spelling, malformed or out-of-range offset) now raises the backend's native error instead of silently normalizing to UTC. New runtime dependencies: tzinfo (Ruby), DateTime + DateTime::TimeZone (Perl — the generated zone modules load OlsonDB, which needs DateTime::Duration), chrono-tz (Rust), tzdata (Python, fallback only).
