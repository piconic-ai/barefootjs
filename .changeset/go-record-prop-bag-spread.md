---
"@barefootjs/go-template": patch
---

On go-template, a destructured prop typed as a record (`bag: Record<string, string>`, `Record<string, unknown>`, optional or not) or as a closed object type (an inline object type, a named type, an inline intersection of same-file object types) spread onto an element (`{...bag}`) now renders the bag's entries. Before, the generated Go did not compile (`cannot use in.Bag (interface{}) as map[string]any`). The bag is read through `bf.Omit`, which copies a map's keys and a struct's members under their JS names, skips an absent optional member, and reads an omitted prop as an empty bag. A prop typed as an object type with an index signature (`{ title: string; [key: string]: string }`), whose generated struct cannot hold an undeclared key, is now refused with BF101 instead of emitting Go that does not compile.
