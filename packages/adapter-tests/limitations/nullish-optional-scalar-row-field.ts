import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: '`??` over an optional scalar field of a typed loop row',
  given:
    "`??` whose left operand is a loop row's optional field declared as one scalar type (`s?: string`, `m?: number`), read as `t.s` or destructured, over rows that hold `''` / `0` and rows that omit the field",
  expected: "a present `''` / `0` is not nullish and is kept; an omitted field takes the fallback",
  actual: "renders the fallback for a present `''` / `0`: the row stores an omitted field as its type's zero value, so `??` cannot tell the two apart",
  fixtures: ['nullish-optional-row-field'],
})
