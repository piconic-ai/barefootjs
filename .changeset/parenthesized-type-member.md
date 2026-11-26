---
"@barefootjs/jsx": patch
---

A parenthesized type (`(T)`) now lowers exactly like `T`. Before, a props member typed `data: (AB)` (also `((AB))`, `(AB) | null`, `(AB)[]`, `Array<(AB)>`) lowered to `unknown`, and a props annotation or alias body written in parentheses (`props: ({ data: AB })`, `type Props = ({ data: AB })`, `type AB = ({ at: Date })`) recorded no members, so a `Date` read through it (`props.data.at.getUTCFullYear()`) rendered empty without any diagnostic on every template adapter and threw in client rendering. Those reads now render through the date helper, and a `Date` read on a loop row typed `(AB)[]` is refused with BF021 exactly as for `AB[]`. A grouped union (`locale: ('en-US' | 'ja-JP') | 'en-GB'`) now lowers exactly like the flat `'en-US' | 'ja-JP' | 'en-GB'`, so a union-typed `toLocaleDateString` locale written that way compiles instead of being refused with BF021.
