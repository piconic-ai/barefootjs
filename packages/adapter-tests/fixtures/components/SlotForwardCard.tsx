import { SlotPositionsPanel } from './SlotPositionsPanel'

export function SlotForwardCard(props: { header?: any }) {
  return <section><SlotPositionsPanel title={props.header} /></section>
}
