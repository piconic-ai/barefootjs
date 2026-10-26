export function TemplateLiteralAttributeQuotes({ tag }: { tag: string }) {
  return <div className={`content-["x"] ${`a-["y"] ${tag}`} z`}>ok</div>
}
