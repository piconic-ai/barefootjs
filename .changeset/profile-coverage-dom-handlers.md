---
"@barefootjs/jsx": patch
"@barefootjs/cli": patch
---

`bf debug profile --scenario` coverage now counts one unit — DOM handler sites — on both sides of the ratio. The denominator is every `on*` event binding on an element plus any rest-forwarded listener the run observed; component callback props (`<Child onClick={…}>`) are no longer counted on their own, since they run inside the child's DOM handler turn. A fully exercised forwarded callback chain (an explicit `onClick={props.onClick}`, a controlled `Switch` / `Checkbox`) now reports 1/1 instead of 1/2, and no longer suggests a scenario file to "cover the rest". An unexercised handler still lowers coverage and fails `--min-coverage`.
