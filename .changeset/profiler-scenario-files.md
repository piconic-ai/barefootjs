---
"@barefootjs/cli": minor
"@barefootjs/jsx": minor
---

Add scenario-file support to `bf debug profile` (#1690, #1796).

`bf debug profile <component> --scenario <story.tsx>` now compiles a "story"
file and its local relative imports, mounts the composition, and fires every
handler — so a component composed from sub-components (the common case) is
profiled as it's actually used, not as a bare mount.

- driver: `loadStory` resolves the story's relative imports (dependency-first);
  `runScenario` compiles each in profile mode, dedupes the concatenated runtime
  imports into one, mounts the story, and fires all IR-known handlers across
  every component in every source.
- jsx: `buildProfileReport` accepts `extraSources` and enumerates every
  component per source (`listComponentFunctions`), merging their id indexes and
  handler bindings — so events from composed sub-components resolve and the
  safety oracle reasons over the right component's graph.

Verified end-to-end: a story composing `Switch` reports `1/1` coverage with its
memos, attribute bindings, and controlled-signal effect source-mapped. Fully
headless components whose handlers/bindings are wired through context remain
limited by analyzer binding-coverage (the same gap as #1795), tracked on #1796.
