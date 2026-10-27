export function TemplateLiteralTextEscape({ tag }: { tag: string }) {
  return <div>{`p ${`q-"<r>" & ${tag}`}`}</div>
}
