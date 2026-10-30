import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A tag-opening brace where the template engine escapes output by context',
  given:
    'a `{` that would open a template tag, in a template-literal value of a URL, event-handler or style attribute (`href={`/p{${a}}`}`) or in the text of a `<style>` element',
  expected: 'the brace as written (`href="/p{x}"`, `<style>.b {{color:red}}</style>`)',
  actual:
    'renders the brace escaped for the context, since it is printed through an output action: `%7b` in a URL attribute, `ZgotmplZ` in a `<style>` element',
  fixtures: ['template-delimiter-contextual-escape'],
})
