import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A dynamic value on a `data-…src/uri/url…` attribute is URL-normalized',
  given:
    'an element attribute named `data-` followed by a name containing `src`, `uri` or `url` (`data-src`, `data-url`) whose value is dynamic (`<div data-src={v()}>`)',
  expected:
    'the attribute carries the value as plain text (`data-src="a b"`, `data-url="javascript:x"`), like any other `data-*` attribute',
  actual:
    'renders the value URL-normalized (`a%20b`) and replaces a value with a non-web scheme with `#ZgotmplZ`, because the template engine escapes such an attribute as a URL',
  fixtures: ['data-url-attr-dynamic-value'],
})
