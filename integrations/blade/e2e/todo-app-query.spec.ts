/**
 * TodoApp E2E tests for the createQuery / createMutation version
 * (`/todos-query`): the shared TodoMVC suite, run against QueryTodoApp.
 */

import { todoAppTests } from '../../shared/e2e/todo-app.spec'

todoAppTests('http://localhost:3015/integrations/blade', '/todos-query')
