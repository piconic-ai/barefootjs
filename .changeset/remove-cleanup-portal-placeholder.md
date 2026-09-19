---
"@barefootjs/client": minor
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
---

Removed `cleanupPortalPlaceholder` (Beta) from `@barefootjs/client`. It had zero in-repo callers, and nothing in the runtime or the compiler ever called it on the author's behalf. Delete any call you had — the server-rendered `<template bf-pp="...">` placeholder it removed is inert (an untargeted `<template>` renders nothing) and needs no cleanup. `createPortal`, `isSSRPortal` and `findSiblingSlot` are unaffected.

`@barefootjs/jsx`'s analyzer no longer recognises `cleanupPortalPlaceholder` as a known runtime import or a browser-only API.

`@barefootjs/hono`'s client shim no longer stubs `cleanupPortalPlaceholder`.
