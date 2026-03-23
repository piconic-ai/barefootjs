import { Input } from '@ui/components/ui/input'
import { Label } from '@ui/components/ui/label'

export function LabelFormDemo() {
  return (
    <div className="flex flex-col gap-4 max-w-sm">
      <div className="grid w-full items-center gap-1.5">
        <Label for="label-name">Name</Label>
        <Input id="label-name" type="text" placeholder="Enter your name" />
      </div>
      <div className="grid w-full items-center gap-1.5">
        <Label for="label-email">Email</Label>
        <Input id="label-email" type="email" placeholder="Enter your email" />
      </div>
    </div>
  )
}

export function LabelDisabledDemo() {
  return (
    <div className="flex flex-col gap-4 max-w-sm">
      <div className="group grid w-full items-center gap-1.5" data-disabled="true">
        <Label for="label-disabled">Disabled field</Label>
        <Input id="label-disabled" type="text" disabled placeholder="Cannot edit" />
      </div>
    </div>
  )
}
