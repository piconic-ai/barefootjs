---
"@barefootjs/go-template": patch
---

A component nested in a named JSX prop's element (`header={<span><Badge /></span>}`) gets its `<Name>SlotN` field and constructor init on the parent's Props, so rendering no longer fails with a missing field. A static child's `key` is stamped as the child's `BfDataKey` (rendered as `data-key`; a quoted key keeps its exact string, so `key="001"` stays `001`) instead of an Input field the child does not have, and a literal child prop is written as an escaped Go string literal, so a backslash or quote in the value keeps its meaning (#3699).
