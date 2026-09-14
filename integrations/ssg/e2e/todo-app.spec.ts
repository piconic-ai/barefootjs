import { todoAppTests } from '../../shared/e2e/todo-app.spec'
import { PORT } from '../constants'

const BASE_PATH = process.env.BASE_PATH ?? '/integrations/ssg'
todoAppTests(`http://localhost:${PORT}${BASE_PATH}`, '/todos')
