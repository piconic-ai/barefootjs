import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Literal-initialized const read as a conditional test',
  given:
    "a `const` initialized with a boolean literal at module or function scope (`const on = true`), or with a string literal inside the component function (`const mode = 'on'`), read as the test of a ternary (`data-x={on ? 'a' : 'b'}`, `data-x={mode === 'on' ? 'a' : 'b'}`)",
  expected: "the branch the const's value selects renders in the server HTML (`data-x=\"a\"`)",
  actual: 'renders the falsy branch as if the const were unset, or throws at render time on an unbound template variable',
  fixtures: ['const-boolean-conditional-test', 'module-const-boolean-conditional-test', 'const-string-conditional-test'],
})
