"use client"
/**
 * SaasLoginDemo
 *
 * Login/signup form with cross-page plan awareness.
 * Reads the billing cycle and selected plan from sessionStorage
 * (written by SaasPricingDemo) to show a contextual banner.
 *
 * Compiler stress targets:
 * - createMemo chain: emailError → passwordError → isFormValid
 * - Conditional banner based on sessionStorage (plan selected on pricing page)
 * - Loading and success states
 * - Signal-driven disabled / aria-invalid bindings
 */

import { createSignal, createMemo } from '@barefootjs/client'
import { Input } from '@ui/components/ui/input'
import { Button } from '@ui/components/ui/button'
import { Separator } from '@ui/components/ui/separator'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@ui/components/ui/card'
import {
  Field,
  FieldLabel,
  FieldContent,
  FieldError,
} from '@ui/components/ui/field'
import {
  ToastProvider,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from '@ui/components/ui/toast'
import {
  readBillingCycle,
  readSelectedPlan,
  type SelectedPlan,
  type BillingCycle,
} from '../../shared/gallery-saas-storage'

const PLAN_LABELS: Record<Exclude<SelectedPlan, null>, string> = {
  free: 'Free',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

export function SaasLoginDemo() {
  const [email, setEmail] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [emailTouched, setEmailTouched] = createSignal(false)
  const [passwordTouched, setPasswordTouched] = createSignal(false)
  const [loading, setLoading] = createSignal(false)
  const [success, setSuccess] = createSignal(false)

  const [selectedPlan, setSelectedPlan] = createSignal<SelectedPlan>(readSelectedPlan())
  const [billingCycle, setBillingCycle] = createSignal<BillingCycle>(readBillingCycle())

  // Sync from sessionStorage on mount (other tabs or same-session navigation)
  if (typeof window !== 'undefined') {
    window.addEventListener('barefoot:saas-storage', () => {
      setSelectedPlan(readSelectedPlan())
      setBillingCycle(readBillingCycle())
    })
  }

  const emailError = createMemo(() => {
    if (!emailTouched()) return ''
    if (email().trim() === '') return 'Email is required'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email())) return 'Invalid email format'
    return ''
  })

  const passwordError = createMemo(() => {
    if (!passwordTouched()) return ''
    if (password() === '') return 'Password is required'
    if (password().length < 8) return 'At least 8 characters required'
    return ''
  })

  const isFormValid = createMemo(
    () =>
      emailError() === '' &&
      passwordError() === '' &&
      email().trim() !== '' &&
      password() !== ''
  )

  const handleSubmit = async () => {
    if (!isFormValid() || loading()) return
    setLoading(true)
    await new Promise((resolve) => setTimeout(resolve, 1200))
    setLoading(false)
    setSuccess(true)
    setEmail('')
    setPassword('')
    setEmailTouched(false)
    setPasswordTouched(false)
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <div className="saas-login flex min-h-[480px] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-4">

        {/* Plan context banner — shown when user came from pricing page */}
        {selectedPlan() ? (
          <div className="saas-plan-banner rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm space-y-0.5">
            <p className="font-medium text-foreground">
              {PLAN_LABELS[selectedPlan()!]} plan selected
            </p>
            <p className="text-muted-foreground text-xs">
              {billingCycle() === 'annual' ? 'Billed annually — save 20%' : 'Billed monthly'}
              . Create an account to continue.
            </p>
          </div>
        ) : null}

        <Card className="w-full">
          <CardHeader>
            <CardTitle>Create your account</CardTitle>
            <CardDescription>
              {selectedPlan()
                ? `Get started with the ${PLAN_LABELS[selectedPlan()!]} plan`
                : 'Deploy your first project in minutes'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* OAuth */}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="saas-oauth-google">
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Google
              </Button>
              <Button variant="outline" className="saas-oauth-github">
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                </svg>
                GitHub
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
              <Field data-invalid={emailError() !== '' || undefined}>
                <FieldLabel for="saas-email">Work email</FieldLabel>
                <FieldContent>
                  <Input
                    id="saas-email"
                    type="email"
                    placeholder="you@company.com"
                    value={email()}
                    onInput={(e) => setEmail(e.target.value)}
                    onBlur={() => setEmailTouched(true)}
                    disabled={loading()}
                    aria-invalid={emailError() !== '' || undefined}
                  />
                  {emailError() !== '' ? (
                    <FieldError>{emailError()}</FieldError>
                  ) : null}
                </FieldContent>
              </Field>

              <Field data-invalid={passwordError() !== '' || undefined}>
                <FieldLabel for="saas-password">Password</FieldLabel>
                <FieldContent>
                  <Input
                    id="saas-password"
                    type="password"
                    placeholder="Min. 8 characters"
                    value={password()}
                    onInput={(e) => setPassword(e.target.value)}
                    onBlur={() => setPasswordTouched(true)}
                    disabled={loading()}
                    aria-invalid={passwordError() !== '' || undefined}
                  />
                  {passwordError() !== '' ? (
                    <FieldError>{passwordError()}</FieldError>
                  ) : null}
                </FieldContent>
              </Field>

              <Button
                className="saas-submit w-full"
                onClick={handleSubmit}
                disabled={!isFormValid() || loading()}
              >
                <span className="button-text">
                  {loading() ? 'Creating account...' : 'Create account'}
                </span>
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex justify-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <a href="#" className="text-primary underline-offset-4 hover:underline">
                Sign in
              </a>
            </p>
          </CardFooter>
        </Card>

        <ToastProvider position="bottom-right">
          <Toast variant="success" open={success()}>
            <div className="flex-1">
              <ToastTitle>Account created!</ToastTitle>
              <ToastDescription>Welcome to Barefoot. Your first deploy awaits.</ToastDescription>
            </div>
            <ToastClose onClick={() => setSuccess(false)} />
          </Toast>
        </ToastProvider>
      </div>
    </div>
  )
}
