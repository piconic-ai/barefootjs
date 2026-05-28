---
"@barefootjs/mojolicious": patch
---

Fix the Mojo test renderer (`renderMojoComponent`) so a child component that destructures a rest-spread bag (`function NativeSelect({ children, ...props })`) renders instead of dying on an undeclared `$props`. `buildChildRenderers` now defaults the rest-props identifier to an empty hashref when the caller doesn't supply one, matching the production runtime's manifest-driven `isRestProps` plumbing (#1652).
