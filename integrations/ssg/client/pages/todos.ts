import { render } from '@barefootjs/client/runtime'
import '../../../shared/components/TodoApp.tsx'

// Relative path ('api/todos', no leading slash). As long as this page is served
// at a flat one-level URL (`${BASE_PATH}/todos`), it resolves to
// `${BASE_PATH}/api/todos` under the same convention as the relative fetch
// inside shared/components/TodoApp.tsx — no need to hardcode BASE_PATH here.
const response = await fetch('api/todos')
const initialTodos = await response.json()

render(document.getElementById('app')!, 'TodoApp', { initialTodos })
