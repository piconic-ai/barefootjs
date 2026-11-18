import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'A dynamic value in the text of a `<style>` or `<script>` element',
  given: 'a string expression as the text of a `<style>` or `<script>` element (`<style>{css}</style>`)',
  expected: 'the value as written inside the element',
  diagnostic: ['BF101'],
  fixtures: ['style-script-text-dynamic', 'raw-text-host-style-script', 'raw-text-host-reactive'],
})
