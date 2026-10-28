export function SlotConditionalCard(props: { header?: any; footer?: any; show?: boolean }) {
  return (
    <section>
      {props.show && <div className="and">{props.header}</div>}
      <div className="ternary">{props.show ? props.footer : 'none'}</div>
    </section>
  )
}
