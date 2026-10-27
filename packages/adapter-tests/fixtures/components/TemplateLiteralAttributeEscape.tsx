export function TemplateLiteralAttributeEscape({ tag }: { tag: string }) {
  return (
    <div className={`content-["x"] [&>svg]:a ${tag} z`} title={`t-["q"] ${`n-<"y"> ${tag}`}`}>
      ok
    </div>
  )
}
