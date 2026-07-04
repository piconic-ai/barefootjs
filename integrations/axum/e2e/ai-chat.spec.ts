/**
 * AI Chat E2E tests for the Axum example
 *
 * Uses shared test suite from integrations/shared/e2e
 */

import { aiChatTests } from '../../shared/e2e/ai-chat.spec'

aiChatTests('http://localhost:3012/integrations/axum')
