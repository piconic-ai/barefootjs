"use client"
/**
 * MultiStepFormDemo Component
 *
 * Multi-step form wizard with step navigation, per-step validation,
 * cross-step state sharing, and a review/confirm step.
 * Compiler stress: multi-branch conditional rendering (4 steps),
 * shared signals across branches, derived validation memos per step,
 * dynamic step indicator with loop + conditional.
 */

import { createSignal, createMemo } from '@barefootjs/dom'
import { Badge } from '@ui/components/ui/badge'
import { Button } from '@ui/components/ui/button'
import { Checkbox } from '@ui/components/ui/checkbox'
import { Input } from '@ui/components/ui/input'
import { Label } from '@ui/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@ui/components/ui/radio-group'
import { Separator } from '@ui/components/ui/separator'
import {
  ToastProvider,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from '@ui/components/ui/toast'

type Step = { id: number; title: string }

const steps: Step[] = [
  { id: 1, title: 'Account' },
  { id: 2, title: 'Profile' },
  { id: 3, title: 'Preferences' },
  { id: 4, title: 'Review' },
]

/**
 * Multi-step form wizard — multi-branch conditional stress test
 *
 * Compiler stress points:
 * - Multi-branch conditional: 4 steps rendered via nested ternary
 * - Shared signals across branches: form values persist across step switches
 * - Derived validation memos per step: step1Valid, step2Valid, step3Valid
 * - Dynamic step indicator: loop with active/completed conditional
 * - Cross-step derived state: canProceed depends on current step + validation
 * - createEffect for auto-focus on step change
 */
export function MultiStepFormDemo() {
  const [currentStep, setCurrentStep] = createSignal(1)

  // Step 1: Account
  const [email, setEmail] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [confirmPassword, setConfirmPassword] = createSignal('')

  // Step 2: Profile
  const [fullName, setFullName] = createSignal('')
  const [username, setUsername] = createSignal('')
  const [bio, setBio] = createSignal('')

  // Step 3: Preferences
  const [plan, setPlan] = createSignal('free')
  const [newsletter, setNewsletter] = createSignal(true)
  const [notifications, setNotifications] = createSignal(true)

  // Toast
  const [toastOpen, setToastOpen] = createSignal(false)
  const [toastMessage, setToastMessage] = createSignal('')

  // Validation memo chain — per-step validation derived from form signals
  const emailError = createMemo(() => {
    const v = email()
    if (!v) return ''
    return v.includes('@') ? '' : 'Invalid email format'
  })

  const passwordError = createMemo(() => {
    const v = password()
    if (!v) return ''
    return v.length >= 8 ? '' : 'At least 8 characters'
  })

  const confirmError = createMemo(() => {
    const c = confirmPassword()
    if (!c) return ''
    return c === password() ? '' : 'Passwords do not match'
  })

  const step1Valid = createMemo(() =>
    email().length > 0 && !emailError() &&
    password().length > 0 && !passwordError() &&
    confirmPassword().length > 0 && !confirmError()
  )

  const usernameError = createMemo(() => {
    const v = username()
    if (!v) return ''
    return v.length >= 3 ? '' : 'At least 3 characters'
  })

  const step2Valid = createMemo(() =>
    fullName().length > 0 && username().length > 0 && !usernameError()
  )

  // Step 3 is always valid (preferences have defaults)
  const step3Valid = createMemo(() => true)

  // Cross-step derived state: can proceed from current step?
  const canProceed = createMemo(() => {
    const step = currentStep()
    if (step === 1) return step1Valid()
    if (step === 2) return step2Valid()
    if (step === 3) return step3Valid()
    return false
  })

  // Step completion status for the step indicator
  const isStepCompleted = (stepId: number): boolean => {
    if (stepId === 1) return step1Valid()
    if (stepId === 2) return step2Valid()
    if (stepId === 3) return step3Valid()
    return false
  }

  const showToast = (message: string) => {
    setToastMessage(message)
    setToastOpen(true)
    setTimeout(() => setToastOpen(false), 3000)
  }

  const goNext = () => {
    if (currentStep() < 4 && canProceed()) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const goBack = () => {
    if (currentStep() > 1) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const goToStep = (stepId: number) => {
    // Allow going back freely, forward only if current step is valid
    if (stepId < currentStep() || canProceed()) {
      setCurrentStep(stepId)
    }
  }

  const handleSubmit = () => {
    showToast(`Account created for ${email()}!`)
    // Reset form
    setCurrentStep(1)
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setFullName('')
    setUsername('')
    setBio('')
    setPlan('free')
    setNewsletter(true)
    setNotifications(true)
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Create Account</h2>
        <Badge variant="outline" className="step-badge">Step {currentStep()} of {steps.length}</Badge>
      </div>

      <div className="multi-step-form rounded-xl border border-border bg-card overflow-hidden">
        {/* Step indicator — loop with active/completed conditional */}
        <div className="step-indicator flex border-b border-border">
          {steps.map(step => (
            <button
              key={step.id}
              className={`step-item flex-1 py-3 px-4 text-sm font-medium text-center transition-colors border-b-2 ${
                currentStep() === step.id
                  ? 'border-primary text-primary'
                  : isStepCompleted(step.id)
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-muted-foreground'
              }`}
              onClick={() => goToStep(step.id)}
            >
              <span className="step-number">{
                isStepCompleted(step.id) && currentStep() !== step.id ? '✓' : step.id
              }</span>
              <span className="hidden sm:inline ml-1.5">{step.title}</span>
            </button>
          ))}
        </div>

        {/* Step content — nested ternary conditional rendering */}
        <div className="p-6 min-h-[320px]">
          {currentStep() === 1 ? (
            <div className="step-content step-1 space-y-4">
              <div>
                <h3 className="text-base font-semibold mb-1">Account Details</h3>
                <p className="text-sm text-muted-foreground">Set up your login credentials.</p>
              </div>
              <div className="space-y-3">
                <div>
                  <Label for="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email()}
                    onInput={(e) => setEmail(e.target.value)}
                  />
                  {emailError() ? (
                    <p className="email-error text-xs text-destructive mt-1">{emailError()}</p>
                  ) : null}
                </div>
                <div>
                  <Label for="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={password()}
                    onInput={(e) => setPassword(e.target.value)}
                  />
                  {passwordError() ? (
                    <p className="password-error text-xs text-destructive mt-1">{passwordError()}</p>
                  ) : null}
                </div>
                <div>
                  <Label for="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Repeat your password"
                    value={confirmPassword()}
                    onInput={(e) => setConfirmPassword(e.target.value)}
                  />
                  {confirmError() ? (
                    <p className="confirm-error text-xs text-destructive mt-1">{confirmError()}</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : currentStep() === 2 ? (
            <div className="step-content step-2 space-y-4">
              <div>
                <h3 className="text-base font-semibold mb-1">Profile Information</h3>
                <p className="text-sm text-muted-foreground">Tell us about yourself.</p>
              </div>
              <div className="space-y-3">
                <div>
                  <Label for="fullname">Full Name</Label>
                  <Input
                    id="fullname"
                    placeholder="John Doe"
                    value={fullName()}
                    onInput={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div>
                  <Label for="username">Username</Label>
                  <Input
                    id="username"
                    placeholder="johndoe"
                    value={username()}
                    onInput={(e) => setUsername(e.target.value)}
                  />
                  {usernameError() ? (
                    <p className="username-error text-xs text-destructive mt-1">{usernameError()}</p>
                  ) : null}
                </div>
                <div>
                  <Label for="bio">Bio (optional)</Label>
                  <Input
                    id="bio"
                    placeholder="A short bio about you"
                    value={bio()}
                    onInput={(e) => setBio(e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : currentStep() === 3 ? (
            <div className="step-content step-3 space-y-4">
              <div>
                <h3 className="text-base font-semibold mb-1">Preferences</h3>
                <p className="text-sm text-muted-foreground">Customize your experience.</p>
              </div>
              <div className="space-y-4">
                <div>
                  <Label className="mb-2 block">Plan</Label>
                  <RadioGroup value={plan()} onValueChange={setPlan}>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="free" />
                      <Label>Free</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="pro" />
                      <Label>Pro — $9/month</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="enterprise" />
                      <Label>Enterprise — $29/month</Label>
                    </div>
                  </RadioGroup>
                  <p className="plan-value text-xs text-muted-foreground mt-1">Selected: {plan()}</p>
                </div>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={newsletter()}
                      onCheckedChange={setNewsletter}
                    />
                    <Label>Subscribe to newsletter</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={notifications()}
                      onCheckedChange={setNotifications}
                    />
                    <Label>Enable email notifications</Label>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="step-content step-4 space-y-4">
              <div>
                <h3 className="text-base font-semibold mb-1">Review</h3>
                <p className="text-sm text-muted-foreground">Confirm your details before creating your account.</p>
              </div>
              <div className="review-summary space-y-3 rounded-lg bg-muted/50 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="review-email font-medium">{email()}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Full Name</span>
                  <span className="review-name font-medium">{fullName()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Username</span>
                  <span className="review-username font-medium">@{username()}</span>
                </div>
                {bio() ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bio</span>
                    <span className="review-bio font-medium truncate max-w-[200px]">{bio()}</span>
                  </div>
                ) : null}
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan</span>
                  <Badge variant={plan() === 'free' ? 'outline' : 'default'} className="review-plan">{plan()}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Newsletter</span>
                  <span>{newsletter() ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Notifications</span>
                  <span>{notifications() ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation buttons — outside conditionals for reliable event binding */}
        <div className="flex items-center justify-between p-6 pt-0">
          <Button
            variant="outline"
            className="back-btn"
            onClick={goBack}
            disabled={currentStep() <= 1}
            style={currentStep() <= 1 ? 'visibility: hidden' : ''}
          >
            Back
          </Button>
          <Button
            className="primary-action-btn"
            onClick={() => currentStep() < 4 ? goNext() : handleSubmit()}
            disabled={currentStep() < 4 && !canProceed()}
          >
            {currentStep() < 4 ? 'Next' : 'Create Account'}
          </Button>
        </div>
      </div>

      <ToastProvider position="bottom-right">
        <Toast variant="success" open={toastOpen()}>
          <div className="flex-1">
            <ToastTitle>Success</ToastTitle>
            <ToastDescription className="toast-message">{toastMessage()}</ToastDescription>
          </div>
          <ToastClose onClick={() => setToastOpen(false)} />
        </Toast>
      </ToastProvider>
    </div>
  )
}
