export function SlotPositionsCard({ header, children }: { header?: any; children?: any }) {
  return (
    <section>
      <header>{header}</header>
      <div className="body">{children}</div>
    </section>
  )
}
