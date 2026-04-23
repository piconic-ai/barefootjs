"use client"
/**
 * SaasPricingDemo
 *
 * SaaS pricing page with billing toggle and plan selection.
 * Client island for the billing toggle and plan CTA clicks.
 * Selection is persisted to sessionStorage so the login page can read it.
 *
 * Compiler stress targets:
 * - Signal-driven billing toggle (isAnnual → price display)
 * - createMemo for savings percentage
 * - Cross-page state write: writeBillingCycle / writeSelectedPlan on plan select
 * - Dynamic loop over plans array (displayPlans memo)
 * - Signal-driven badge conditional ("Save 20%")
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/client'
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@ui/components/ui/card'
import { Badge } from '@ui/components/ui/badge'
import { Button } from '@ui/components/ui/button'
import { Switch } from '@ui/components/ui/switch'
import { Separator } from '@ui/components/ui/separator'
import {
  readBillingCycle,
  writeBillingCycle,
  readSelectedPlan,
  writeSelectedPlan,
  type SelectedPlan,
} from '../../shared/gallery-saas-storage'

type PlanTier = 'free' | 'pro' | 'enterprise'

type Plan = {
  id: PlanTier
  name: string
  description: string
  monthlyPrice: number
  annualPrice: number
  recommended: boolean
  cta: string
  highlights: string[]
}

const ANNUAL_DISCOUNT = 20

const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'For side projects and experimentation',
    monthlyPrice: 0,
    annualPrice: 0,
    recommended: false,
    cta: 'Get started',
    highlights: ['1 project', 'Basic analytics', 'Community support', '1 GB bandwidth/mo'],
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'For professionals and growing teams',
    monthlyPrice: 2000,
    annualPrice: 1600,
    recommended: true,
    cta: 'Start free trial',
    highlights: [
      'Unlimited projects',
      'Advanced analytics',
      'Priority support',
      '100 GB bandwidth/mo',
      'Custom domains',
      'Team collaboration (up to 5)',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large organizations with custom needs',
    monthlyPrice: 8000,
    annualPrice: 6400,
    recommended: false,
    cta: 'Contact sales',
    highlights: [
      'Everything in Pro',
      'Unlimited teammates',
      'SSO & SAML',
      'Dedicated support',
      'Unlimited bandwidth',
      'SLA guarantee',
      'Audit logs',
    ],
  },
]

function formatPrice(cents: number): string {
  if (cents === 0) return '$0'
  return `$${(cents / 100).toFixed(0)}`
}

export function SaasPricingDemo() {
  const [isAnnual, setIsAnnual] = createSignal(readBillingCycle() === 'annual')
  const [selectedPlan, setSelectedPlan] = createSignal<SelectedPlan>(readSelectedPlan())

  const savingsPercent = createMemo(() => (isAnnual() ? ANNUAL_DISCOUNT : 0))
  const displayPlans = createMemo(() => PLANS)

  createEffect(() => {
    writeBillingCycle(isAnnual() ? 'annual' : 'monthly')
  })

  createEffect(() => {
    writeSelectedPlan(selectedPlan())
  })

  const handlePlanSelect = (tier: PlanTier) => {
    setSelectedPlan(tier)
    // Navigate to login with the selection persisted
    window.location.href = '/gallery/saas/login'
  }

  return (
    <div className="saas-pricing w-full max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-10">

      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="saas-pricing-title text-3xl sm:text-4xl font-bold tracking-tight">
          Simple, transparent pricing
        </h1>
        <p className="text-muted-foreground text-lg">
          Start free. Upgrade as you grow. No surprises.
        </p>

        {/* Billing toggle */}
        <div className="saas-billing-toggle flex items-center justify-center gap-3 pt-2">
          <span className={isAnnual() ? 'billing-label text-sm font-medium text-muted-foreground' : 'billing-label text-sm font-medium text-foreground'}>
            Monthly
          </span>
          <Switch
            checked={isAnnual()}
            onCheckedChange={setIsAnnual}
            aria-label="Toggle annual billing"
          />
          <span className={isAnnual() ? 'billing-label text-sm font-medium text-foreground' : 'billing-label text-sm font-medium text-muted-foreground'}>
            Annual
          </span>
          {isAnnual() ? (
            <Badge variant="default" className="savings-badge">Save {savingsPercent()}%</Badge>
          ) : null}
        </div>
      </div>

      {/* Plan cards */}
      <div className="saas-plan-cards grid grid-cols-1 md:grid-cols-3 gap-6">
        {displayPlans().map((plan) => (
          <Card
            key={plan.id}
            className={`saas-plan-card relative ${plan.recommended ? 'border-primary shadow-lg ring-1 ring-primary' : ''}`}
          >
            {plan.recommended ? (
              <Badge variant="default" className="saas-popular-badge absolute -top-3 left-1/2 -translate-x-1/2">
                Most popular
              </Badge>
            ) : null}

            <CardHeader className="text-center">
              <CardTitle className="saas-plan-name">{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
              <div className="mt-4">
                <span className="saas-price-amount text-4xl font-bold">
                  {isAnnual() ? formatPrice(plan.annualPrice) : formatPrice(plan.monthlyPrice)}
                </span>
                <span className="saas-price-period text-muted-foreground text-sm ml-1">
                  {plan.monthlyPrice === 0 ? '' : isAnnual() ? '/mo billed annually' : '/month'}
                </span>
              </div>
              {isAnnual() && plan.monthlyPrice > 0 ? (
                <p className="saas-original-price text-sm text-muted-foreground line-through">
                  {formatPrice(plan.monthlyPrice)}/mo
                </p>
              ) : null}
            </CardHeader>

            <CardContent>
              <Separator />
              <ul className="saas-feature-list mt-4 space-y-2">
                {plan.highlights.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <span className="text-primary shrink-0 mt-0.5">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter>
              <Button
                variant={plan.recommended ? 'default' : 'outline'}
                className="saas-plan-cta w-full"
                data-plan={plan.id}
                onClick={() => handlePlanSelect(plan.id)}
              >
                {plan.cta}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Selected plan feedback */}
      {selectedPlan() ? (
        <p className="saas-selected-feedback text-center text-sm text-muted-foreground">
          Selected:{' '}
          <span className="font-medium text-foreground saas-selected-plan-name">{selectedPlan()}</span>
          {' — '}
          {isAnnual() ? 'billed annually' : 'billed monthly'}
        </p>
      ) : null}

    </div>
  )
}
