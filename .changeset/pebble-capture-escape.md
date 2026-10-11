---
'@barefootjs/pebble': patch
---

Content captured by a `{% set %}…{% endset %}` block (forwarded children, a portaled element) is now autoescaped like the rest of the template. The capture node did not let template visitors into its body, so a markup-valued prop inside it rendered unescaped.
