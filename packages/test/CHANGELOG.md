# @barefootjs/test

## 0.5.1

### Patch Changes

- Updated dependencies [8742059]
- Updated dependencies [9dcffdf]
- Updated dependencies [5d49015]
- Updated dependencies [113a17c]
  - @barefootjs/jsx@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies [5cf7272]
- Updated dependencies [cbed3cc]
- Updated dependencies [909b17a]
- Updated dependencies [d13dc5c]
- Updated dependencies [6326d07]
  - @barefootjs/jsx@0.5.0

## 0.4.0

### Patch Changes

- dbda2e0: `TestNode#on()` now returns `undefined` (instead of `null`) for unwired events, matching the `onClick`/`onInput`/`onChange`/`onSubmit` shorthand getters — so a single matcher (`toBeUndefined()`) covers either accessor. Also documents that `EventHandler.setters`/`via` resolve only raw signal setters declared in the component and stay empty for library property-access handlers (e.g. `@barefootjs/form`'s `name.handleInput`, `form.handleSubmit`).
- Updated dependencies [2d817a0]
  - @barefootjs/jsx@0.4.0

## 0.3.0

### Minor Changes

- d811ca3: Resolve event-handler wiring on component props (e.g. `<Button onClick={...}>`, `<Switch onCheckedChange={...}>`), matching the `bf debug events` CLI. Component callback props are keyed by the DOM-style event name (onClick → click, onCheckedChange → checkedChange).
- d64f94b: Add EventHandler wiring to TestNode: onClick, onInput, onChange, onSubmit shorthands and on() fallback

### Patch Changes

- Updated dependencies [52a511d]
- Updated dependencies [ea37bfc]
- Updated dependencies [0111b70]
- Updated dependencies [d64f94b]
- Updated dependencies [210563a]
  - @barefootjs/jsx@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [bac95e6]
- Updated dependencies [4e4d31a]
- Updated dependencies [bff7df6]
- Updated dependencies [31ce089]
- Updated dependencies [89a6ad5]
  - @barefootjs/jsx@0.2.0

## 0.1.3

### Patch Changes

- Updated dependencies [91523ba]
- Updated dependencies [a5a466c]
- Updated dependencies [a57e113]
  - @barefootjs/jsx@0.1.3

## 0.1.2

### Patch Changes

- @barefootjs/jsx@0.1.2

## 0.1.1

### Patch Changes

- c896b8b: Fix published packages: resolve workspace:\* and point exports to dist/
- Updated dependencies [c896b8b]
  - @barefootjs/jsx@0.1.1
