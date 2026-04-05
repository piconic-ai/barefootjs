import { test, expect } from '@playwright/test'

test.describe('Chat Block', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/chat')
  })

  test.describe('Initial Rendering', () => {
    test('shows contact list with 4 contacts', async ({ page }) => {
      const section = page.locator('[bf-s^="ChatDemo_"]:not([data-slot])').first()
      const contacts = section.locator('.contact-item')
      await expect(contacts).toHaveCount(4)
    })

    test('shows Alice as active contact by default', async ({ page }) => {
      const section = page.locator('[bf-s^="ChatDemo_"]:not([data-slot])').first()
      await expect(section.locator('.active-contact-name')).toHaveText('Alice Chen')
    })

    test('shows messages for Alice', async ({ page }) => {
      const section = page.locator('[bf-s^="ChatDemo_"]:not([data-slot])').first()
      const messages = section.locator('.message-bubble')
      await expect(messages).toHaveCount(3)
    })

    test('shows unread badges for contacts with unread messages', async ({ page }) => {
      const section = page.locator('[bf-s^="ChatDemo_"]:not([data-slot])').first()
      // Carol has 1 unread (message 8, readUpTo is 7), Dave has 0 (readUpTo is 9)
      // Bob has 0 (readUpTo is 5, only message 4 is from them, id 4 <= 5)
      const unreadBadges = section.locator('.unread-badge')
      await expect(unreadBadges.first()).toBeVisible()
    })

    test('shows total unread count', async ({ page }) => {
      const section = page.locator('[bf-s^="ChatDemo_"]:not([data-slot])').first()
      await expect(section.locator('.total-unread')).toBeVisible()
    })
  })

  test.describe('Contact Switching', () => {
    test('clicking Bob shows Bob messages', async ({ page }) => {
      const section = page.locator('[bf-s^="ChatDemo_"]:not([data-slot])').first()

      // Click Bob contact
      await section.locator('.contact-name:has-text("Bob Park")').click()

      // Header should update
      await expect(section.locator('.active-contact-name')).toHaveText('Bob Park')

      // Should show Bob's 2 messages
      const messages = section.locator('.message-bubble')
      await expect(messages).toHaveCount(2)
    })

    test('switching to Carol marks her messages as read', async ({ page }) => {
      const section = page.locator('[bf-s^="ChatDemo_"]:not([data-slot])').first()

      // Carol should have unread badge before clicking
      const carolContact = section.locator('.contact-item').filter({ hasText: 'Carol Liu' })

      // Click Carol
      await carolContact.click()

      // Carol's unread badge should disappear after marking as read
      await expect(carolContact.locator('.unread-badge')).not.toBeVisible()
    })
  })

  test.describe('Sending Messages', () => {
    test('typing and sending a message adds it to the list', async ({ page }) => {
      const section = page.locator('[bf-s^="ChatDemo_"]:not([data-slot])').first()
      const input = section.locator('.chat-input input')
      const sendButton = section.locator('.chat-input button:has-text("Send")')

      // Initially 3 messages for Alice
      await expect(section.locator('.message-bubble')).toHaveCount(3)

      // Type and send
      await input.fill('Hello from the test!')
      await sendButton.click()

      // Should now have 4 messages
      await expect(section.locator('.message-bubble')).toHaveCount(4)

      // New message should be visible
      await expect(section.locator('.message-text:has-text("Hello from the test!")')).toBeVisible()
    })

    test('input is cleared after sending', async ({ page }) => {
      const section = page.locator('[bf-s^="ChatDemo_"]:not([data-slot])').first()
      const input = section.locator('.chat-input input')
      const sendButton = section.locator('.chat-input button:has-text("Send")')

      await input.fill('Test message')
      await sendButton.click()

      await expect(input).toHaveValue('')
    })

    test('Enter key sends message', async ({ page }) => {
      const section = page.locator('[bf-s^="ChatDemo_"]:not([data-slot])').first()
      const input = section.locator('.chat-input input')

      await input.fill('Enter key test')
      await input.press('Enter')

      await expect(section.locator('.message-text:has-text("Enter key test")')).toBeVisible()
    })

    test('send button is disabled when input is empty', async ({ page }) => {
      const section = page.locator('[bf-s^="ChatDemo_"]:not([data-slot])').first()
      const sendButton = section.locator('.chat-input button:has-text("Send")')
      await expect(sendButton).toBeDisabled()
    })
  })

  test.describe('Typing Indicator', () => {
    test('shows typing indicator after sending, then auto-reply arrives', async ({ page }) => {
      const section = page.locator('[bf-s^="ChatDemo_"]:not([data-slot])').first()
      const input = section.locator('.chat-input input')
      const sendButton = section.locator('.chat-input button:has-text("Send")')

      await input.fill('Trigger reply')
      await sendButton.click()

      // Typing indicator should appear (use longer timeout for DOM update)
      await expect(section.locator('.typing-indicator')).toBeVisible({ timeout: 3000 })

      // After ~1.5s, auto-reply arrives and typing indicator disappears
      await expect(section.locator('.typing-indicator')).not.toBeVisible({ timeout: 5000 })

      // Should now have 5 messages (3 original + 1 sent + 1 auto-reply)
      await expect(section.locator('.message-bubble')).toHaveCount(5)
    })
  })

  test.describe('Contact Search', () => {
    test('filtering contacts by name', async ({ page }) => {
      const section = page.locator('[bf-s^="ChatDemo_"]:not([data-slot])').first()
      const searchInput = section.locator('.contact-list input')

      await searchInput.fill('alice')

      // Should show only Alice
      const contacts = section.locator('.contact-item')
      await expect(contacts).toHaveCount(1)
      await expect(contacts.first().locator('.contact-name')).toHaveText('Alice Chen')
    })

    test('clearing search shows all contacts', async ({ page }) => {
      const section = page.locator('[bf-s^="ChatDemo_"]:not([data-slot])').first()
      const searchInput = section.locator('.contact-list input')

      await searchInput.fill('alice')
      await expect(section.locator('.contact-item')).toHaveCount(1)

      await searchInput.fill('')
      await expect(section.locator('.contact-item')).toHaveCount(4)
    })
  })

  test.describe('Last Message Preview', () => {
    test('contact list shows last message text', async ({ page }) => {
      const section = page.locator('[bf-s^="ChatDemo_"]:not([data-slot])').first()

      // Alice's last message is "Nice! Any bugs found?"
      const aliceContact = section.locator('.contact-item').filter({ hasText: 'Alice Chen' })
      await expect(aliceContact.locator('.last-message')).toContainText('Nice! Any bugs found?')
    })
  })
})
