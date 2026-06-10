# @barefootjs/test

## 0.13.0

### Patch Changes

- @barefootjs/jsx@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [6489ede]
  - @barefootjs/jsx@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [42974e4]
- Updated dependencies [0187b4c]
- Updated dependencies [cafd0b4]
- Updated dependencies [719a8fe]
- Updated dependencies [a901c73]
- Updated dependencies [c4de967]
- Updated dependencies [c15d550]
- Updated dependencies [4ccc227]
- Updated dependencies [ce2ea33]
- Updated dependencies [ca59e22]
- Updated dependencies [54aaa91]
- Updated dependencies [67d6847]
- Updated dependencies [c30e089]
- Updated dependencies [aafbccc]
- Updated dependencies [5caa4d9]
- Updated dependencies [c26b408]
- Updated dependencies [1955cea]
- Updated dependencies [f6d497d]
- Updated dependencies [7d8cb6b]
- Updated dependencies [23efcea]
- Updated dependencies [570e5bb]
- Updated dependencies [0488005]
- Updated dependencies [e29bf9f]
- Updated dependencies [526f165]
- Updated dependencies [271350a]
- Updated dependencies [4e5d724]
- Updated dependencies [0e41034]
- Updated dependencies [bea6488]
- Updated dependencies [e4a63f1]
- Updated dependencies [3038728]
- Updated dependencies [650b672]
- Updated dependencies [9877323]
- Updated dependencies [a76e460]
- Updated dependencies [07b95ad]
- Updated dependencies [7079ca0]
- Updated dependencies [3f99394]
- Updated dependencies [1919a0c]
- Updated dependencies [eb9d66a]
- Updated dependencies [207802f]
  - @barefootjs/jsx@0.11.0

## 0.10.1

### Patch Changes

- Updated dependencies [a62612b]
  - @barefootjs/jsx@0.10.1

## 0.10.0

### Patch Changes

- @barefootjs/jsx@0.10.0

## 0.9.6

### Patch Changes

- @barefootjs/jsx@0.9.6

## 0.9.5

### Patch Changes

- Updated dependencies [4812524]
  - @barefootjs/jsx@0.9.5

## 0.9.4

### Patch Changes

- Updated dependencies [0a103b3]
  - @barefootjs/jsx@0.9.4

## 0.9.3

### Patch Changes

- Updated dependencies [79e64d5]
- Updated dependencies [f00e74d]
  - @barefootjs/jsx@0.9.3

## 0.9.2

### Patch Changes

- @barefootjs/jsx@0.9.2

## 0.9.1

### Patch Changes

- @barefootjs/jsx@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies [cfbb4b6]
- Updated dependencies [7d91adc]
- Updated dependencies [52ec729]
- Updated dependencies [0cb8081]
  - @barefootjs/jsx@0.9.0

## 0.8.0

### Patch Changes

- @barefootjs/jsx@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [43cb708]
- Updated dependencies [677c614]
  - @barefootjs/jsx@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies [d4dc638]
- Updated dependencies [2d4edce]
- Updated dependencies [8daf057]
- Updated dependencies [0a05dfc]
- Updated dependencies [3529d0f]
- Updated dependencies [9420ef8]
- Updated dependencies [b4a8df8]
  - @barefootjs/jsx@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [35e5f73]
- Updated dependencies [b24a1e6]
- Updated dependencies [9f6b711]
- Updated dependencies [bfac066]
- Updated dependencies [f6ab725]
- Updated dependencies [a2c1810]
- Updated dependencies [9cf0a27]
  - @barefootjs/jsx@0.6.0

## 0.5.3

### Patch Changes

- Updated dependencies [b7ffce1]
- Updated dependencies [2c1f3ad]
- Updated dependencies [5231cc8]
- Updated dependencies [0f0d880]
- Updated dependencies [72fdbe2]
- Updated dependencies [d32c45d]
  - @barefootjs/jsx@0.5.3

## 0.5.2

### Patch Changes

- Updated dependencies [ad11fb8]
- Updated dependencies [562d343]
- Updated dependencies [dff7704]
  - @barefootjs/jsx@0.5.2

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
