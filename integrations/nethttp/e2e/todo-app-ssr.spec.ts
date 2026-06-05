import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:8083/integrations/nethttp', '/todos-ssr')
