import { aiChatTests } from '../../shared/e2e/ai-chat.spec'
import { PORT } from '../constants'

const BASE_PATH = process.env.BASE_PATH ?? '/integrations/ssg'
aiChatTests(`http://localhost:${PORT}${BASE_PATH}`)
