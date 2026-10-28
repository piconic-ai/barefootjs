// Child of the `escaped-ternary-branch` fixture: the `function C(props)`
// form, with an escaped string-literal ternary branch read through
// `props.on` and a forwarded prop that already carries an escaped value.
export function EscapedTernaryLabel(props: { on: boolean; text: string }) {
  return (
    <em data-c={props.on ? 'c\nd' : 'e\'f'} title={props.text}>
      {props.on ? 'g\\h' : 'i\'j'}
    </em>
  )
}
