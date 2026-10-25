---
"@barefootjs/go-template": patch
---

Declare the BF101 refusal of a component loop row over an array prop that passes a child prop computed from the row (`label={n.toString()}`) and is keyed by a computed expression of the row that no child prop carries (`key={n.toString()}`) against the new `caller-rows-computed-key` limitation, with a `/* @client */` escape fixture.
