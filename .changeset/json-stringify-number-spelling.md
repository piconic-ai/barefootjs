---
"@barefootjs/php": patch
"@barefootjs/perl": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
---

`JSON.stringify` writes numbers as JS does, at any depth: an integral float without `.0` (`[-2,-0.5]`, not `[-2.0,-0.5]`), JS exponent notation (`-4e-8`, `-400000000000000000000`, `-4e+21`, not `-4e-08`, `-4.0e-8` or `-4e+20`), the shortest round-trip digits (`0.30000000000000004`, not `0.3`), and `Infinity`, `-Infinity` and `NaN` as `null`. Before, Jinja and ERB wrote `-2.0`; Blade, Twig, Rust, Mojolicious, Xslate and ERB used their host language's exponent spelling; Mojolicious and Xslate rounded to 15 significant digits and wrote a non-finite number as `"-Inf"` or `-Inf`; ERB failed to render a non-finite number, and go-template one inside an array. On Rust the same spelling also applies to the props JSON written for hydration.
