import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:8082/integrations/chi', '/todos-ssr')
