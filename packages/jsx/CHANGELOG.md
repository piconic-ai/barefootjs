# @barefootjs/jsx

## 1.0.0

### Minor Changes

- 4e4d31a: Add `bf debug events` command for tracing event handler -> setter -> signal -> DOM update paths
- 89a6ad5: Add .entries()/.keys()/.values() iteration shapes (#1448 Tier B)

### Patch Changes

- bac95e6: Extract classifyDOMProp as single source of truth for DOM attribute vs JSX prop classification
- bff7df6: Fix reactive expressions inside conditional branches not updating when dependencies change
- 31ce089: Fix prop name substitution corrupting string literals in client JS (e.g. `"size-9"` → `"(_p.size ?? 'default')-9"`)
- Updated dependencies [2313724]
- Updated dependencies [bac95e6]
  - @barefootjs/shared@1.0.0
  - @barefootjs/client@1.0.0

## 0.1.3

### Patch Changes

- 91523ba: Add .findLast(p) / .findLastIndex(p) higher-order method lowering (#1448 Tier B). Go template adapter lowers via bf_find_last / bf_find_last_index runtime helpers (equality predicates) and range-based template blocks (complex predicates). Mojo adapter refuses with BF101 (matching existing find/findIndex gap).
- a5a466c: Compile props.X.map() to mapArray for reactive DOM reconciliation instead of static forEach (#1586). Direct prop array references in .map() expressions are now treated as potentially reactive, consistent with the compiler's existing "props are always reactive" design.
- a57e113: Unify inner-loop reactive-attribute emit through the centralised emitAttrUpdate helper (#1368). Fixes boolean-attr handling in nested loops (now uses DOM property assignment) and adds missing className/value special-case handling.
  - @barefootjs/client@0.1.3
  - @barefootjs/shared@0.1.3

## 0.1.2

### Patch Changes

- @barefootjs/client@0.1.2
- @barefootjs/shared@0.1.2

## 0.1.1

### Patch Changes

- c896b8b: Fix published packages: resolve workspace:\* and point exports to dist/
- Updated dependencies [c896b8b]
  - @barefootjs/client@0.1.1
  - @barefootjs/shared@0.1.1
