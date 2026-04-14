import { test, expect } from '@playwright/test'

test.describe('Form Builder Block', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/components/form-builder')
  })

  const section = (page: any) =>
    page.locator('[bf-s^="FormBuilderDemo_"]:not([data-slot])').first()

  // --- Initial Render ---

  test.describe('Initial Render', () => {
    test('shows field count badge', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.field-count')).toContainText('6 fields')
    })

    test('shows required count badge', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.required-count')).toContainText('3 required')
    })

    test('renders all initial field editors', async ({ page }) => {
      const s = section(page)
      await expect(s.locator('.field-editor')).toHaveCount(6)
    })

    test('first field has type text and label Full Name', async ({ page }) => {
      const s = section(page)
      const first = s.locator('.field-editor').first()
      await expect(first.locator('.field-type-select')).toHaveValue('text')
      await expect(first.locator('.field-label-input')).toHaveValue('Full Name')
    })

    test('select field has options input', async ({ page }) => {
      const s = section(page)
      const countryField = s.locator('.field-editor').nth(2)
      await expect(countryField.locator('.field-type-select')).toHaveValue('select')
      await expect(countryField.locator('.options-input')).toBeVisible()
    })

    test('group field shows child fields', async ({ page }) => {
      const s = section(page)
      const groupField = s.locator('.field-editor').nth(3)
      await expect(groupField.locator('.field-type-select')).toHaveValue('group')
      await expect(groupField.locator('.child-field')).toHaveCount(3)
    })
  })

  // --- Add Fields ---

  test.describe('Add Fields', () => {
    test('add text field increases count', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-text-btn').click()
      await expect(s.locator('.field-count')).toContainText('7 fields')
      await expect(s.locator('.field-editor')).toHaveCount(7)
    })

    test('add select field shows options input', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-select-btn').click()
      const newField = s.locator('.field-editor').last()
      await expect(newField.locator('.field-type-select')).toHaveValue('select')
      await expect(newField.locator('.options-input')).toBeVisible()
    })

    test('add group field shows add-child button', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-group-btn').click()
      const newField = s.locator('.field-editor').last()
      await expect(newField.locator('.field-type-select')).toHaveValue('group')
      await expect(newField.locator('.add-child-btn')).toBeVisible()
    })

    test('add checkbox field increases count', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-checkbox-btn').click()
      await expect(s.locator('.field-count')).toContainText('7 fields')
    })

    test('add textarea field shows placeholder input', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-textarea-btn').click()
      const newField = s.locator('.field-editor').last()
      await expect(newField.locator('.field-type-select')).toHaveValue('textarea')
      await expect(newField.locator('.placeholder-input')).toBeVisible()
    })
  })

  // --- Delete Fields ---

  test.describe('Delete Fields', () => {
    test('delete decreases field count', async ({ page }) => {
      const s = section(page)
      await s.locator('.field-editor').first().locator('.delete-field').click()
      await expect(s.locator('.field-count')).toContainText('5 fields')
      await expect(s.locator('.field-editor')).toHaveCount(5)
    })
  })

  // --- Type Switching (Schema Change → Loop Rebuild) ---

  test.describe('Type Switching', () => {
    test('switching to select shows options input', async ({ page }) => {
      const s = section(page)
      const first = s.locator('.field-editor').first()
      await expect(first.locator('.options-input')).not.toBeVisible()
      await first.locator('.field-type-select').selectOption('select')
      await expect(first.locator('.options-input')).toBeVisible()
    })

    test('switching to group shows children area', async ({ page }) => {
      const s = section(page)
      const second = s.locator('.field-editor').nth(1)
      await second.locator('.field-type-select').selectOption('group')
      await expect(second.locator('.group-children')).toBeVisible()
      await expect(second.locator('.add-child-btn')).toBeVisible()
    })

    test('switching away from select hides options input', async ({ page }) => {
      const s = section(page)
      // Country field (index 2) is a select
      const countryField = s.locator('.field-editor').nth(2)
      await expect(countryField.locator('.options-input')).toBeVisible()
      await countryField.locator('.field-type-select').selectOption('text')
      await expect(countryField.locator('.options-input')).not.toBeVisible()
    })
  })

  // --- Edit Field Label ---

  test.describe('Edit Field Label', () => {
    test('editing label updates the input value', async ({ page }) => {
      const s = section(page)
      const first = s.locator('.field-editor').first()
      await first.locator('.field-label-input').fill('Updated Name')
      await expect(first.locator('.field-label-input')).toHaveValue('Updated Name')
    })
  })

  // --- Required Toggle ---

  test.describe('Required Toggle', () => {
    test('toggling required updates required count', async ({ page }) => {
      const s = section(page)
      // Initial: 3 required. Uncheck the first required field (Full Name).
      const firstField = s.locator('.field-editor').first()
      // Full Name is required, so check is true. Click to uncheck.
      await firstField.locator('.required-checkbox').click()
      await expect(s.locator('.required-count')).toContainText('2 required')
    })
  })

  // --- Move Fields ---

  test.describe('Move Fields', () => {
    test('move down shifts field position', async ({ page }) => {
      const s = section(page)
      const fields = s.locator('.field-editor')
      // First field is 'Full Name', second is 'Email'
      await expect(fields.first().locator('.field-label-input')).toHaveValue('Full Name')
      await expect(fields.nth(1).locator('.field-label-input')).toHaveValue('Email')
      // Move Full Name down
      await fields.first().locator('.move-down').click()
      // Now first should be Email, second Full Name
      await expect(fields.first().locator('.field-label-input')).toHaveValue('Email')
      await expect(fields.nth(1).locator('.field-label-input')).toHaveValue('Full Name')
    })

    test('move up shifts field position', async ({ page }) => {
      const s = section(page)
      const fields = s.locator('.field-editor')
      // Second field is 'Email'
      await fields.nth(1).locator('.move-up').click()
      // Now first should be Email
      await expect(fields.first().locator('.field-label-input')).toHaveValue('Email')
    })
  })

  // --- Group Children (Nested Loop) ---

  test.describe('Group Children', () => {
    test('add child increases child count in group', async ({ page }) => {
      const s = section(page)
      // Address group is at index 3 with 3 initial children
      const groupField = s.locator('.field-editor').nth(3)
      await expect(groupField.locator('.child-field')).toHaveCount(3)
      await groupField.locator('.add-child-btn').click()
      await expect(groupField.locator('.child-field')).toHaveCount(4)
    })

    test('remove child decreases child count', async ({ page }) => {
      const s = section(page)
      const groupField = s.locator('.field-editor').nth(3)
      await expect(groupField.locator('.child-field')).toHaveCount(3)
      await groupField.locator('.remove-child').first().click()
      await expect(groupField.locator('.child-field')).toHaveCount(2)
    })

    test('child type select is editable', async ({ page }) => {
      const s = section(page)
      const groupField = s.locator('.field-editor').nth(3)
      const firstChild = groupField.locator('.child-field').first()
      await firstChild.locator('.child-type-select').selectOption('checkbox')
      await expect(firstChild.locator('.child-type-select')).toHaveValue('checkbox')
    })

    test('child label input is editable', async ({ page }) => {
      const s = section(page)
      const groupField = s.locator('.field-editor').nth(3)
      const firstChild = groupField.locator('.child-field').first()
      await firstChild.locator('.child-label-input').fill('New Child')
      await expect(firstChild.locator('.child-label-input')).toHaveValue('New Child')
    })
  })

  // --- Preview Panel ---

  test.describe('Preview Panel', () => {
    test('renders preview fields for all initially visible fields', async ({ page }) => {
      const s = section(page)
      // Company has visibleWhen: 'Full Name', so initially hidden (5 visible)
      await expect(s.locator('.preview-field')).toHaveCount(5)
    })

    test('renders all field types in preview', async ({ page }) => {
      const s = section(page)
      // Full Name + Email are both text type → 2 text fields visible
      await expect(s.locator('.preview-field-text')).toHaveCount(2)
      await expect(s.locator('.preview-field-select')).toHaveCount(1)
      await expect(s.locator('.preview-field-group')).toHaveCount(1)
      await expect(s.locator('.preview-field-checkbox')).toHaveCount(1)
    })

    test('preview input is interactive', async ({ page }) => {
      const s = section(page)
      const previewInput = s.locator('.preview-input').first()
      await previewInput.fill('Test Value')
      await expect(previewInput).toHaveValue('Test Value')
    })

    test('group preview shows nested child inputs', async ({ page }) => {
      const s = section(page)
      const groupPreview = s.locator('.preview-field-group').first()
      await expect(groupPreview.locator('.child-preview')).toHaveCount(3)
      await expect(groupPreview.locator('.preview-child-input')).toHaveCount(3)
    })
  })

  // --- Conditional Visibility ---

  test.describe('Conditional Visibility', () => {
    test('Company field hidden when Full Name is empty', async ({ page }) => {
      const s = section(page)
      // Company textarea has visibleWhen: 'Full Name', which is empty → not in DOM
      await expect(s.locator('.preview-field-textarea')).toHaveCount(0)
    })

    test('Company field visible when Full Name is filled', async ({ page }) => {
      const s = section(page)
      // Fill Full Name in preview
      await s.locator('.preview-input').first().fill('John Doe')
      // Company textarea should now appear
      await expect(s.locator('.preview-field-textarea')).toHaveCount(1)
      await expect(s.locator('.preview-field')).toHaveCount(6)
    })

    test('Company field hidden again when Full Name is cleared', async ({ page }) => {
      const s = section(page)
      const nameInput = s.locator('.preview-input').first()
      await nameInput.fill('John Doe')
      await expect(s.locator('.preview-field-textarea')).toHaveCount(1)
      await nameInput.fill('')
      await expect(s.locator('.preview-field-textarea')).toHaveCount(0)
    })
  })

  // --- Toast ---

  test.describe('Toast', () => {
    test('adding a field shows toast', async ({ page }) => {
      const s = section(page)
      await s.locator('.add-text-btn').click()
      await expect(page.locator('.toast-message').first()).toContainText('Added')
    })

    test('deleting a field shows toast', async ({ page }) => {
      const s = section(page)
      await s.locator('.field-editor').first().locator('.delete-field').click()
      await expect(page.locator('.toast-message').first()).toContainText('Field removed')
    })
  })
})
