# @barefootjs/test

## 0.19.0

### Patch Changes

- Updated dependencies [2246d40]
- Updated dependencies [1d50425]
  - @barefootjs/jsx@0.19.0

## 0.18.7

### Patch Changes

- Updated dependencies [fd73cf0]
- Updated dependencies [52e9b47]
- Updated dependencies [638b774]
- Updated dependencies [f2faa2a]
- Updated dependencies [1cab45b]
- Updated dependencies [ecf3f14]
- Updated dependencies [752ee52]
- Updated dependencies [42e9066]
  - @barefootjs/jsx@0.18.7

## 0.18.6

### Patch Changes

- Updated dependencies [4144cb2]
- Updated dependencies [20a3d27]
- Updated dependencies [09e8eb9]
- Updated dependencies [60a0919]
  - @barefootjs/jsx@0.18.6

## 0.18.5

### Patch Changes

- Updated dependencies [7bd1762]
- Updated dependencies [69bfd35]
- Updated dependencies [9a9f7ce]
- Updated dependencies [3779c8d]
- Updated dependencies [7e12b55]
- Updated dependencies [be2b48d]
- Updated dependencies [9b3707a]
  - @barefootjs/jsx@0.18.5

## 0.18.4

### Patch Changes

- Updated dependencies [a9383fd]
- Updated dependencies [23cc4dc]
- Updated dependencies [438f2fe]
  - @barefootjs/jsx@0.18.4

## 0.18.3

### Patch Changes

- Updated dependencies [a46d4a5]
  - @barefootjs/jsx@0.18.3

## 0.18.2

### Patch Changes

- Updated dependencies [4c722c8]
  - @barefootjs/jsx@0.18.2

## 0.18.1

### Patch Changes

- @barefootjs/jsx@0.18.1

## 0.18.0

### Patch Changes

- Updated dependencies [1beeaa2]
- Updated dependencies [6c13ce7]
- Updated dependencies [99cfd04]
- Updated dependencies [0636582]
- Updated dependencies [a475666]
- Updated dependencies [17f5a17]
- Updated dependencies [477406d]
- Updated dependencies [5de765a]
- Updated dependencies [36fec0e]
- Updated dependencies [fa03384]
- Updated dependencies [e76405d]
- Updated dependencies [cb93420]
- Updated dependencies [5ba3ccc]
- Updated dependencies [fa393c0]
  - @barefootjs/jsx@0.18.0

## 0.17.1

### Patch Changes

- d0882c7: Drop unresolvable dynamic interpolation spans (e.g. a `${className}` passthrough) from `TestNode.classes` instead of leaking them as literal `${...}` tokens. `Record<T, string>[key]` indexed lookups already resolve with union semantics (structured `lookup` template part, PR #2000); this cleans the one remaining artifact in the resolved token list so exact-match assertions on `.classes` see only real class tokens.
- 4803308: Resolve literal destructure defaults (`{ size = 'md' }`) in `renderToTest()` (#2071). The framework models the zero-props render, so a bare reference to a defaulted prop now resolves to its literal default in expression attributes (`type={type}` → `'button'`), template interpolations (`` `chip-${tone}` `` → `chip-ok` in `.classes`), and text expressions (`findByText('Hello')` finds `{label}` with `{ label = 'Hello' }`). Inline ternary classNames now union both branches like the intermediate-const path (#525) instead of leaking a `{cond}` placeholder token. Non-literal defaults (arrows, arrays, computed expressions) keep their expression text; signal/memo reads are untouched.
- Updated dependencies [6b3bba3]
- Updated dependencies [882847c]
  - @barefootjs/jsx@0.17.1

## 0.17.0

### Patch Changes

- Updated dependencies [63afac4]
- Updated dependencies [f4e715b]
- Updated dependencies [38bdc63]
- Updated dependencies [e0a8ec6]
- Updated dependencies [96696bd]
- Updated dependencies [1c364fb]
- Updated dependencies [c5c3eb0]
- Updated dependencies [1d5da4d]
- Updated dependencies [7a2a061]
- Updated dependencies [1e6635a]
- Updated dependencies [a231927]
- Updated dependencies [22e0101]
- Updated dependencies [290b904]
- Updated dependencies [25a9c0f]
- Updated dependencies [28db2cb]
- Updated dependencies [9815330]
- Updated dependencies [ce5d511]
- Updated dependencies [aefe7a0]
- Updated dependencies [8b19546]
- Updated dependencies [07649cb]
- Updated dependencies [fd4655c]
- Updated dependencies [ab6b65f]
- Updated dependencies [59b4efc]
- Updated dependencies [e9ed338]
- Updated dependencies [d330fe1]
- Updated dependencies [5b3b134]
- Updated dependencies [758f4db]
- Updated dependencies [c8c7d50]
- Updated dependencies [837ae95]
- Updated dependencies [5d89c86]
- Updated dependencies [d779e7b]
- Updated dependencies [3938a6f]
  - @barefootjs/jsx@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [c921865]
  - @barefootjs/jsx@0.16.0

## 0.15.2

### Patch Changes

- @barefootjs/jsx@0.15.2

## 0.15.1

### Patch Changes

- @barefootjs/jsx@0.15.1

## 0.15.0

### Patch Changes

- Updated dependencies [2339a2f]
- Updated dependencies [ae67ac7]
- Updated dependencies [166177d]
- Updated dependencies [8d2cbe8]
- Updated dependencies [77974ee]
- Updated dependencies [071a1a3]
- Updated dependencies [6547370]
  - @barefootjs/jsx@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [9bba0d3]
  - @barefootjs/jsx@0.14.0

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
