---
"@barefootjs/jsx": patch
---

On the template adapters, a closed rest key read inside a larger attribute value is now omitted when the caller omits the key, as Hono omits it. A closed rest spread repeated with no open spread between (`<p {...rest} {...rest}>`) reads `rest.id ?? (rest.id)` on its second expansion, which rendered `id=""` for an omitted `id`; an earlier attribute that becomes the rest's fallback (`<p title={rest.id} {...rest}>`) and a ternary branch (`title={on ? rest.id : 'x'}`) did the same. A present value, `''` and `0` included, renders as before. A caller that passes the key of a repeated rest still renders it once per expansion (limitation `closed-rest-repeated`).
