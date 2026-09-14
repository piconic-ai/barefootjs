import { formTests } from '../../shared/e2e/form.spec'
import { PORT } from '../constants'

const BASE_PATH = process.env.BASE_PATH ?? '/integrations/ssg'
formTests(`http://localhost:${PORT}${BASE_PATH}`)
