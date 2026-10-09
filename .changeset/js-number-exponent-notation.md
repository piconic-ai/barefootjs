---
'@barefootjs/php': patch
'@barefootjs/erb': patch
'@barefootjs/jinja': patch
---

A number at JavaScript's decimal/exponent notation boundary now prints the way JavaScript does in the PHP (Blade, Twig), Ruby (ERB) and Python (Jinja) runtimes (#3380). JavaScript prints decimal within [1e-6, 1e21) and an unpadded lower-case exponent outside it, so the runtimes now print `0.00000123456789`, `1.23456789e-7` and `1.23456789e+21` instead of `1.23456789E-6`, `1.23456789e-07` or the full 22 digits. Integers past 2**53 likewise print the shortest digits padded with zeros (`12345678901234567000`), as JavaScript does.
