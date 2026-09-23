import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A child component inside a reactive conditional branch that is active at hydration is initialized twice',
  given:
    'a child component rendered directly inside a reactive conditional branch (`{cond() ? <Child /> : null}` or `{cond() && <Child />}`) whose branch is active when the page hydrates or client-mounts, where the child has client-side effects (an `onMount` listener, a `createEffect`)',
  expected:
    "the child is initialized once and owned by its branch: each effect / listener runs once per trigger, and all of them are disposed when the branch is removed",
  actual:
    "keeps a second client-side instance of the child that the branch does not own: every effect and listener fires twice per trigger, and removing the branch disposes only one of the two, so the other keeps reacting after the child is gone from the DOM (SSR markup is unaffected)",
  fixtures: ['conditional-child-listener-cleanup'],
})
