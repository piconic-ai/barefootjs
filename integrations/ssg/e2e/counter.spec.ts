import { counterTests } from '../../shared/e2e/counter.spec'
import { PORT } from '../constants'

const BASE_PATH = process.env.BASE_PATH ?? '/integrations/ssg'
counterTests(`http://localhost:${PORT}${BASE_PATH}`)
