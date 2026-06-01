/**
 * AI Chat (SSE Streaming) E2E tests for h3 example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { aiChatTests } from '../../shared/e2e/ai-chat.spec'

aiChatTests('http://localhost:3003')
