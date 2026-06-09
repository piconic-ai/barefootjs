---
"@barefootjs/cli": patch
---

fix(profile): reject `--scenario` combined with `--diff` (#1849 B4)

`--scenario` (measure a run) and `--diff` (compare two compiles) are mutually exclusive modes. Combining them previously ran the scenario and silently dropped `--diff`; it now errors up front with an explanatory message.
