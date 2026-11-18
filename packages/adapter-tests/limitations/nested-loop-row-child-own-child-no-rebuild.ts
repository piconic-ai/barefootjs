import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: "A nested loop's row component with a child of its own and a rest object can't be built per row",
  given:
    "a child-component `.map()` inside another loop's row whose row component renders a child component of its own and collects a rest object (e.g. `groups.map(g => <section>{g.tags.map(t => <Badge key={t} label={t} />)}</section>)` with `function Badge({ label, ...rest }) { return <em {...rest}><Dot tone={label} />{label}</em> }`)",
  expected: "every inner row renders with a scope of its own, and its nested child's scope under it",
  diagnostic: 'BF101',
  fixtures: ['nested-loop-child-component-rest-own-child'],
})
