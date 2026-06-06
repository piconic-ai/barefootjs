---
"@barefootjs/mojolicious": patch
---

Fix the Mojolicious test renderer's child component scope id: it hardcoded a
literal `test_<slotId>` prefix, so a composed child rendered
`bf-s="test_s5"` instead of `<parentScope>_<slotId>` (e.g.
`ReactiveProps_test_s5`) like Hono / CSR. Children now derive their scope id
from the parent's live `$bf->_scope_id`, mirroring the xslate adapter's
`rootChildScopePrefix`. This unblocks the `reactive-props` conformance fixture
on Mojo (xslate already passed it), bringing the two Perl-targeting adapters
to parity on it.
