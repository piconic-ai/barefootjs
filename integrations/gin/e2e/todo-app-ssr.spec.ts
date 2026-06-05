import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:8081/integrations/gin', '/todos-ssr')
