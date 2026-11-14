import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An open rest bag spread onto a child component',
  given:
    "a component whose props type is open (an index signature) spreads its destructured rest onto a child component (`function Card({ title, ...rest }: CardProps) { return <Tag {...rest} /> }`)",
  expected: "every key the rest carries reaches the child, merged with the call's explicit props in source order",
  actual: "drops the spread: the child receives only the call's explicit props",
  fixtures: ['open-rest-spread-child-omits-keys', 'open-rest-spread-child'],
})
