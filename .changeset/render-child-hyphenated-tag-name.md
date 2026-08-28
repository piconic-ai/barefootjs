---
"@barefootjs/client": patch
---

Fix `renderChild`'s attribute splicing corrupting hyphenated tag names. The first tag's name was matched with `\w+`, which stops at a hyphen, so the scope and `data-key` attributes were spliced into the MIDDLE of a custom element's name — `<my-widget>` became `<my data-key="1"-widget>`, which the parser then drops entirely, removing the element from the DOM.

Reachable from ordinary source: a fragment-rooted child component whose root is a custom element, used as a keyed `.map()` row, goes through this splice. SSR places the same attributes as a compiler-emitted JSX spread and was always correct, so the two legs diverged with no diagnostic.

The tag-name class is now `[a-zA-Z][^\s/>]*`, shared as `FIRST_TAG_PATTERN` / `TAG_HEAD_PATTERN` across every splice site in `renderChild` rather than repeated inline — the leading-letter anchor keeps the existing behaviour of skipping past a template's opening comment markers (`<!--bf-cond-start:...-->`) to the first real element.
