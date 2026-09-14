import { render } from '@barefootjs/client/runtime'
import '../../../shared/components/Toggle.tsx'

const toggleItems = [
  { label: 'Setting 1', defaultOn: true },
  { label: 'Setting 2', defaultOn: false },
  { label: 'Setting 3', defaultOn: false },
]

render(document.getElementById('app')!, 'Toggle', { toggleItems })
