---
"@barefootjs/go-template": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/blade": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
"@barefootjs/pebble": patch
---

An optional-chained `.length` (`{props.items?.length}`) over an absent or `null` receiver now renders empty, as JavaScript reads `undefined`. It used to render `0`, the length of an empty array. An empty array or string still renders `0`, and a `?? 0` fallback still takes over for an absent receiver. On go-template, an absent optional string prop still reads as `""` (and so `0`), because its struct field is a plain `string`.
