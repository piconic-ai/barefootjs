import { portalTests } from '../../shared/e2e/portal.spec'
import { PORT } from '../constants'

const BASE_PATH = process.env.BASE_PATH ?? '/integrations/ssg'
portalTests(`http://localhost:${PORT}${BASE_PATH}`)
