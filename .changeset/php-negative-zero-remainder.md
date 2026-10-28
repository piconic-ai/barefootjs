---
"@barefootjs/php": patch
"@barefootjs/blade": patch
---

PHP runtime: `mod` now keeps JavaScript's `-0` for the zero remainder of a negative int dividend, so `1 / (-4 % 2)` renders `-Infinity` on Blade and Twig instead of `Infinity` (#3698). The remainder still prints `0` and compares equal to `0`. Blade's computed index access now reads its key through the new runtime helper `$bf->index_key`, which turns `-0.0` into `0`, so `items[x % 2]` still reads index `0` there (`data_get` read `-0.0` as the key `"-0"`). A literal index is emitted as before.
