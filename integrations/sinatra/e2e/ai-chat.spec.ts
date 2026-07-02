/**
 * AI Chat E2E tests for Sinatra example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { aiChatTests } from '../../shared/e2e/ai-chat.spec'

aiChatTests('http://localhost:3008/integrations/sinatra')
