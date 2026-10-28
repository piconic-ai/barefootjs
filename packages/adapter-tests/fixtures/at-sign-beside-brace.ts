import { createFixture } from '../src/types'

/**
 * A literal `@` in static text and literal attribute values, right next to
 * a literal brace, bang or another `@`, at the start and end of a text run,
 * and before a newline. However an adapter spells `@` in its template, the
 * spelling must not fuse with the characters around it into template
 * syntax (Blade: `{` + `{{ … }}` opens a `{{{ … }}}` echo). A doubled
 * brace (`{{@`, `@{{`) is left out: on its own it is a delimiter on several
 * engines, which is a separate gap; the Blade unit test
 * `blade-static-at-sign.test.ts` covers it for Blade.
 */
export const fixture = createFixture({
  id: 'at-sign-beside-brace',
  description: 'A literal @ beside a literal brace, bang, @ or newline in static text and literal attribute values',
  source: `
export function AtSignBesideBrace(props: { b: string }) {
  return (
    <div title="{@" data-a="@}" data-d="@@" data-e="@" data-f="{!!@" data-g="@!!}">
      <p>&#123;@</p>
      <p>@&#125;</p>
      <p>@@</p>
      <p>@</p>
      <p>&#123;!!@</p>
      <p>@!!&#125;</p>
      <p>@ start, end @</p>
      <p>&#123;@{props.b}@&#125;</p>
      <pre>a@&#10;b@&#13;&#10;c@&#10;&#10;d</pre>
    </div>
  )
}
`,
  props: { b: 'y' },
  expectedHtml: `
    <div bf-s="test" data-a="@}" data-d="@@" data-e="@" data-f="{!!@" data-g="@!!}" title="{@">
      <p>{@</p>
      <p>@}</p>
      <p>@@</p>
      <p>@</p>
      <p>{!!@</p>
      <p>@!!}</p>
      <p>@ start, end @</p>
      <p bf="s1">{@<!--bf:s0-->y<!--/-->@}</p>
      <pre>a@ b@ c@ d</pre>
    </div>
  `,
})
