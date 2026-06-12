---
"@barefootjs/xslate": patch
"@barefootjs/mojolicious": patch
---

Test harnesses: nested `render_child` calls now resolve — a child template rendering another imported component (AccordionTrigger → ChevronDownIcon) executed against a fresh `BarefootJS` instance whose child-renderer registry started empty. The parent's registry is now shared with each child instance.
