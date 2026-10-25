import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

const text = '` \\ ${notCode} \\n ${rows}'

export const spec: SharedFixtureSpec = {
  id: 'client-template-static-delimiters',
  componentName: 'ClientTemplateStaticDelimiters',
  sourceRoot: 'fixture',
  description: 'Static text and attributes preserve JS template delimiters in roots, loop rows and conditional branches',
  interactions: [
    { type: 'expectText', selector: 'span', text },
    { type: 'expectAttribute', selector: 'span', attribute: 'title', value: text },
    { type: 'click', selector: '.add' },
    { type: 'expectText', selector: 'p:nth-of-type(3)', text: text + ' 3' },
    { type: 'expectAttribute', selector: 'p:nth-of-type(3)', attribute: 'title', value: text },
    { type: 'click', selector: '.clear' },
    { type: 'expectHidden', selector: 'p' },
    { type: 'expectHidden', selector: 'b' },
    { type: 'click', selector: '.add' },
    { type: 'expectText', selector: 'p', text: text + ' 1' },
    { type: 'expectText', selector: 'b', text },
  ],
}

export const fixture = defineSharedFixture(spec)
