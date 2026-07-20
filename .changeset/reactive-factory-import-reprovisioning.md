---
'@barefootjs/jsx': minor
---

Cross-file reactive-factory imports (#2332): BF112 now declines inlining only
for bindings genuinely local to the helper file (top-level const/let/var,
function/class/enum names, default/namespace imports). A helper-file named
value import that an inlined factory body references is instead re-imported
into the component file, using a component-relative specifier (bare/npm
specifiers pass through unchanged) and deduped across every factory inlined
into that file. New diagnostic BF113: a re-provisioned import whose local
name collides with an existing binding in the component file declines that
specific call site instead of risking a silent shadow.

Known limitation: the CLI's build-cache dependency scanner does not track the
existence of a factory's helper-file imports, only its own resolved path, so
deleting/renaming that third module can leave a stale build until a
content change to a tracked file triggers a rebuild. Left as a follow-up.
