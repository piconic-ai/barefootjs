# @barefootjs/go-template

## 0.4.0

## 0.3.0

## 0.2.0

### Minor Changes

- 89a6ad5: Add .entries()/.keys()/.values() iteration shapes (#1448 Tier B)

### Patch Changes

- Updated dependencies [bac95e6]
- Updated dependencies [4e4d31a]
- Updated dependencies [bff7df6]
- Updated dependencies [31ce089]
- Updated dependencies [89a6ad5]
  - @barefootjs/jsx@0.2.0

## 0.1.3

### Patch Changes

- 91523ba: Add .findLast(p) / .findLastIndex(p) higher-order method lowering (#1448 Tier B). Go template adapter lowers via bf_find_last / bf_find_last_index runtime helpers (equality predicates) and range-based template blocks (complex predicates). Mojo adapter refuses with BF101 (matching existing find/findIndex gap).
- e16730d: Fix nullish coalescing (`??`) branch selection for unset props: map JS `null` to Go `nil` instead of empty string so `{{if ne .Field nil}}` correctly evaluates to false when the field is unset.
- 85d0507: Hoist preambles for template-block composition in expressions: when a higher-order method with a complex predicate (findLast, findLastIndex, every, some) is composed inside binary/logical/conditional expressions, the template block is structurally split into a preamble and a variable reference so the output is valid Go template syntax. Migrate all template-block producers (findLast, findLastIndex, every, some) from fixed $bf_result to counter-based unique variable names ($bf_r0, $bf_r1, ...) to avoid redeclaration conflicts when multiple blocks are composed.
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
