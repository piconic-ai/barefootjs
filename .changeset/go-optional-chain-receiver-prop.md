---
'@barefootjs/go-template': patch
---

An omitted optional scalar prop read through an optional chain (`props.text?.length`) now renders empty instead of `0`, and the hydration payload omits it. Such props are now typed `interface{}`, so the nil guard sees the absent value.
