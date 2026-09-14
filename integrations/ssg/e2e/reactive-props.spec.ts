import { reactivePropsTests } from '../../shared/e2e/reactive-props.spec'
import { PORT } from '../constants'

const BASE_PATH = process.env.BASE_PATH ?? '/integrations/ssg'
reactivePropsTests(`http://localhost:${PORT}${BASE_PATH}`)
