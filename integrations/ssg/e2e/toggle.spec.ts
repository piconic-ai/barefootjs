import { toggleTests } from '../../shared/e2e/toggle.spec'
import { PORT } from '../constants'

const BASE_PATH = process.env.BASE_PATH ?? '/integrations/ssg'
toggleTests(`http://localhost:${PORT}${BASE_PATH}`)
