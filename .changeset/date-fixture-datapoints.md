---
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/xslate": patch
"@barefootjs/mojolicious": patch
---

Extend #2274 (Date as the first catalogued rich type) into the oracle
conformance harness: a `Date`-typed prop can now be a data-point value,
rendered through every backend and compared live against the JS reference.

- The adapter test-render prop-bakers transport a `Date` prop as its
  ISO-8601 string, which each backend's shipped `date` runtime helper
  parses — source-literal emitters (Go, Python/Jinja, Perl/Xslate+Mojo)
  gain an explicit `Date` branch; the JSON-payload serializers (Rust's
  `encodeSpecials`, and Ruby/PHP which stringify props directly) carry the
  ISO string through `Date.prototype.toJSON`.
- `assertJsonDomain` admits the catalogued `Date` type (a real instance, or
  the `{ $date: ISO }` envelope the generated catalogue uses so a `Date`
  survives the committed JSON artifact); the data-point runner materializes
  the envelope back into a `Date` before both render legs, and the
  type-derived adversarial catalogue synthesizes the epoch / pre-1970 /
  leap-day / four-digit-year grid for any `Date`-typed prop.
- New `date-catalogued` fixture with data points covering `toISOString()`
  and `getUTCFullYear()`.
