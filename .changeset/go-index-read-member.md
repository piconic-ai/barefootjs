---
"@barefootjs/go-template": patch
---

Go template: a member read off an index read (`rows[1].n`, `rows[k].n`, `obj['a.b'].v`, and a longer chain such as `rows[0].meta.z`) now renders. The member was appended to the index read's key (`bf_get .Rows "1".N`), which does not parse, or reads the member off the key. It is now read through `bf_get`, in value and condition position alike, so it finds the field of a generated row struct and the key of decoded data under a `Record`.
