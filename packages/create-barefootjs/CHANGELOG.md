# create-barefootjs

## 0.18.0

### Patch Changes

- d6eb672: Adapter discovery: `--list-adapters` prints every adapter id + CSS library option; `--adapter go`/`golang`/`perl` now get a targeted hint naming the concrete adapter ids instead of the generic unknown-adapter error; a failed init no longer leaves an empty target directory behind; adapter/css choices resolved via flags or `--yes` print the same "✔" confirmation lines as the interactive picker.
- Updated dependencies [d6eb672]
- Updated dependencies [ee52d11]
- Updated dependencies [0636582]
- Updated dependencies [f20a0a3]
- Updated dependencies [abde658]
- Updated dependencies [693b6cc]
- Updated dependencies [fa03384]
- Updated dependencies [e76405d]
- Updated dependencies [9a9fb09]
- Updated dependencies [f126fdf]
  - @barefootjs/cli@0.18.0

## 0.17.1

### Patch Changes

- @barefootjs/cli@0.17.1

## 0.17.0

### Patch Changes

- @barefootjs/cli@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [c921865]
  - @barefootjs/cli@0.16.0

## 0.15.2

### Patch Changes

- @barefootjs/cli@0.15.2

## 0.15.1

### Patch Changes

- Updated dependencies [e66227c]
  - @barefootjs/cli@0.15.1

## 0.15.0

### Patch Changes

- @barefootjs/cli@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [1bb8d53]
  - @barefootjs/cli@0.14.0

## 0.13.0

### Minor Changes

- 361082e: Add a `--css none` (bring your own CSS) option to `bf init` / `create-barefootjs`. Selecting it (via the interactive prompt or `--css none`) opts out of the UnoCSS + UI-registry layer across every adapter: no registry probe/fetch, no `uno.config.ts` or stylesheets, no `unocss` in the package.json scripts/devDeps, and a dependency-free starter `Counter` built from native `<button>` elements. The default `unocss` path is unchanged.

### Patch Changes

- Updated dependencies [361082e]
  - @barefootjs/cli@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [003b57e]
  - @barefootjs/cli@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [42974e4]
- Updated dependencies [dd3213a]
- Updated dependencies [5c54182]
- Updated dependencies [fa239fe]
- Updated dependencies [5d6a7ab]
- Updated dependencies [de14a0a]
- Updated dependencies [0faeb51]
- Updated dependencies [4ccc227]
- Updated dependencies [e9f724d]
- Updated dependencies [ce2ea33]
- Updated dependencies [8058e18]
- Updated dependencies [c30e089]
- Updated dependencies [aafbccc]
- Updated dependencies [f6d497d]
- Updated dependencies [e743370]
- Updated dependencies [3038728]
- Updated dependencies [1919a0c]
  - @barefootjs/cli@0.11.0

## 0.10.1

### Patch Changes

- Updated dependencies [a62612b]
  - @barefootjs/cli@0.10.1

## 0.10.0

### Patch Changes

- Updated dependencies [8e60a7a]
  - @barefootjs/cli@0.10.0

## 0.9.6

### Patch Changes

- @barefootjs/cli@0.9.6

## 0.9.5

### Patch Changes

- @barefootjs/cli@0.9.5

## 0.9.4

### Patch Changes

- @barefootjs/cli@0.9.4

## 0.9.3

### Patch Changes

- @barefootjs/cli@0.9.3

## 0.9.2

### Patch Changes

- Updated dependencies [9a4f49f]
  - @barefootjs/cli@0.9.2

## 0.9.1

### Patch Changes

- @barefootjs/cli@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [c7a38ec]
- Updated dependencies [7be78dd]
  - @barefootjs/cli@0.9.0

## 0.8.0

### Patch Changes

- @barefootjs/cli@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [27bb9e6]
- Updated dependencies [e6b0428]
- Updated dependencies [1c9e5bf]
  - @barefootjs/cli@0.7.0

## 0.6.1

### Patch Changes

- @barefootjs/cli@0.6.1

## 0.6.0

### Patch Changes

- @barefootjs/cli@0.6.0

## 0.5.3

### Patch Changes

- Updated dependencies [f122f64]
- Updated dependencies [72fdbe2]
  - @barefootjs/cli@0.5.3

## 0.5.2

### Patch Changes

- @barefootjs/cli@0.5.2

## 0.5.1

### Patch Changes

- @barefootjs/cli@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies [5cf7272]
  - @barefootjs/cli@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [bb5cfc1]
- Updated dependencies [085e3d4]
  - @barefootjs/cli@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [0111b70]
- Updated dependencies [4e4c5a6]
- Updated dependencies [215fa25]
  - @barefootjs/cli@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [4e4d31a]
- Updated dependencies [57262dd]
  - @barefootjs/cli@0.2.0

## 0.1.3

### Patch Changes

- Updated dependencies [3335b89]
  - @barefootjs/cli@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [6b567a9]
  - @barefootjs/cli@0.1.2

## 0.1.1

### Patch Changes

- c896b8b: Fix published packages: resolve workspace:\* and point exports to dist/
- Updated dependencies [c896b8b]
  - @barefootjs/cli@0.1.1
