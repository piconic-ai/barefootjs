import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A later attribute after a closed rest declaring it in two letter cases',
  given:
    'a closed rest spread whose props type declares one attribute in two ASCII letter cases (`tabIndex?: number; tabindex?: number`), followed by an explicit attribute that writes it (`tabindex="1"`), with the caller passing the other spelling',
  expected: 'the attribute renders once, with the later write (`tabindex="1"`)',
  actual: 'Renders the rest key of the other spelling beside the later write (`tabIndex="2" tabindex="1"`), so a browser keeps the rest\'s value',
  fixtures: ['spread-closed-rest-both-cases-later-write'],
})
