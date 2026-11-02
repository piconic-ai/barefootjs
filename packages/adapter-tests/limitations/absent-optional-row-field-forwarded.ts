import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An absent optional row field passed to a loop-row child component',
  given:
    "a loop row's optional scalar field (`tone?: string`) passed as it is to a child component's prop (`<Item tone={r.tone} />`), over rows that omit the field, where the child binds the prop to an attribute (`class={tone}`, `data-tone={tone}`)",
  expected: 'the child receives `undefined` for a row that omits the field, so the attribute is omitted',
  actual: "renders the attribute empty (`class=\"\"`): the row stores an omitted field as its type's zero value, so the child receives a present `''`",
  fixtures: ['loop-row-child-absent-optional-field-attr'],
})
