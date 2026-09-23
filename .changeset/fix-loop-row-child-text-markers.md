---
"@barefootjs/jsx": patch
---

A keyed loop row whose child component received parent-owned reactive text as `children` (`<TableCell>{payment.id}</TableCell>`) lost its SSR `<!--bf:^sN-->…<!--/-->` slot markers on hydration: the row's effect rewrote the whole child root with `.textContent =`. `buildChildrenTextEffect` / `stringifyChildrenTextEffect` (the single shared decision for both the component-root and composite loop paths) now patch each expression child through its own marker. The whole-root `.textContent` join is kept only for a text-only conditional mix or a slot-less child. The `data-table` fixture is the regression test.
