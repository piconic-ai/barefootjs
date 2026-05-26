import { Button } from '../button'
import { PlusIcon, XIcon, CheckIcon } from '../icon'

export function Default() {
  return <Button>Button</Button>
}

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button variant="default">Default</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  )
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button size="default">Default</Button>
      <Button size="sm">Sm</Button>
      <Button size="lg">Lg</Button>
      <Button size="icon"><PlusIcon size="md" /></Button>
      <Button size="icon-sm"><XIcon size="sm" /></Button>
      <Button size="icon-lg"><CheckIcon size="lg" /></Button>
    </div>
  )
}

