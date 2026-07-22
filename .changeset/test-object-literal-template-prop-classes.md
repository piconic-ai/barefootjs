---
'@barefootjs/test': patch
---

Fix `resolveConstants` (used by `renderToTest`'s `TestNode.classes`) to also resolve an object-literal className constant's template-literal-valued properties (`` { active: `${base} row-active` } ``), not just plain string literals — a member-access className ternary (`className={cond ? rowClass.active : rowClass.plain}`) previously fell back to `[]` for this common shape instead of the actual class tokens (#2360, follow-up to #2354/#2355).
