import { conditionalReturnTests } from '../../shared/e2e/conditional-return.spec'
import { PORT } from '../constants'

const BASE_PATH = process.env.BASE_PATH ?? '/integrations/ssg'
conditionalReturnTests(`http://localhost:${PORT}${BASE_PATH}`)
