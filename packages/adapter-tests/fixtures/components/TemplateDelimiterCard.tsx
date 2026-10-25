export function TemplateDelimiterCard(props: { header?: any; children?: any }) {
  return <section><header>{props.header}</header><div>{props.children}</div></section>
}
