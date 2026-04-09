"use client"
/**
 * PricingDemo
 *
 * SaaS pricing page with billing toggle, feature comparison, and plan selection.
 *
 * Compiler stress targets:
 * - Signal-driven ternary in text (price changes with billing toggle)
 * - One signal → many DOM updates (isAnnual fans out to ~10 sites)
 * - Computed savings memo from billing signal
 * - Badge conditional from signal ("Save 20%")
 * - 3-level nested loop (categories × features × plans)
 * - Nested ternary (typeof + boolean) in comparison table
 * - Signal-driven class on multiple elements
 */

import { createSignal, createMemo } from '@barefootjs/dom'
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@ui/components/ui/card'
import { Badge } from '@ui/components/ui/badge'
import { Button } from '@ui/components/ui/button'
import { Switch } from '@ui/components/ui/switch'
import { Separator } from '@ui/components/ui/separator'

// --- Types ---

type PlanTier = 'free' | 'pro' | 'enterprise'

type Feature = {
  id: number
  name: string
  category: string
  free: boolean | string
  pro: boolean | string
  enterprise: boolean | string
}

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

// --- Data ---

const ANNUAL_DISCOUNT = 20

const plans: Plan[] = [
  {
    id: 'free', name: 'Free',
    description: 'For personal projects and experimentation',
    monthlyPrice: 0, annualPrice: 0, recommended: false, cta: 'Get Started',
    highlights: ['1 project', 'Basic analytics', 'Community support', '1GB storage'],
  },
  {
    id: 'pro', name: 'Pro',
    description: 'For professionals and growing teams',
    monthlyPrice: 2000, annualPrice: 1600, recommended: true, cta: 'Start Free Trial',
    highlights: ['Unlimited projects', 'Advanced analytics', 'Priority support', '100GB storage', 'Custom domains', 'Team collaboration'],
  },
  {
    id: 'enterprise', name: 'Enterprise',
    description: 'For large organizations with custom needs',
    monthlyPrice: 8000, annualPrice: 6400, recommended: false, cta: 'Contact Sales',
    highlights: ['Everything in Pro', 'SSO & SAML', 'Dedicated support', 'Unlimited storage', 'SLA guarantee', 'Audit logs'],
  },
]

const allFeatures: Feature[] = [
  { id: 1, name: 'Projects', category: 'Core', free: '1', pro: 'Unlimited', enterprise: 'Unlimited' },
  { id: 2, name: 'Team members', category: 'Core', free: '1', pro: '10', enterprise: 'Unlimited' },
  { id: 3, name: 'Storage', category: 'Core', free: '1GB', pro: '100GB', enterprise: 'Unlimited' },
  { id: 4, name: 'Analytics', category: 'Features', free: 'Basic', pro: 'Advanced', enterprise: 'Advanced' },
  { id: 5, name: 'Custom domains', category: 'Features', free: false, pro: true, enterprise: true },
  { id: 6, name: 'API access', category: 'Features', free: false, pro: true, enterprise: true },
  { id: 7, name: 'Webhooks', category: 'Features', free: false, pro: true, enterprise: true },
  { id: 8, name: 'Priority support', category: 'Support', free: false, pro: true, enterprise: true },
  { id: 9, name: 'Dedicated account manager', category: 'Support', free: false, pro: false, enterprise: true },
  { id: 10, name: 'SSO & SAML', category: 'Security', free: false, pro: false, enterprise: true },
  { id: 11, name: 'SLA guarantee', category: 'Security', free: false, pro: false, enterprise: true },
  { id: 12, name: 'Audit logs', category: 'Security', free: false, pro: false, enterprise: true },
]

// --- Helpers ---

function formatPrice(cents: number): string {
  if (cents === 0) return '$0'
  return `$${(cents / 100).toFixed(0)}`
}

function featureValue(val: boolean | string): string {
  if (typeof val === 'boolean') return val ? '✓' : '—'
  return val
}

// --- Component ---

export function PricingDemo() {
  const [isAnnual, setIsAnnual] = createSignal(false)
  const [selectedPlan, setSelectedPlan] = createSignal<PlanTier | null>(null)

  const savingsPercent = createMemo(() => isAnnual() ? ANNUAL_DISCOUNT : 0)

  // Wrap plans in a memo so the compiler treats the loop as dynamic (mapArray).
  // Dynamic loops generate insert() for signal-dependent conditionals in children.
  const displayPlans = createMemo(() => plans)

  return (
    <div className="pricing-page w-full max-w-5xl mx-auto space-y-10">

      {/* Header + Billing Toggle */}
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold tracking-tight">Simple, transparent pricing</h2>
        <p className="text-muted-foreground">Choose the plan that fits your needs</p>

        <div className="billing-toggle flex items-center justify-center gap-3">
          {/* Signal-driven class on static elements */}
          <span className={isAnnual() ? 'billing-label text-sm font-medium text-muted-foreground' : 'billing-label text-sm font-medium text-foreground'}>
            Monthly
          </span>
          <Switch
            checked={isAnnual()}
            onCheckedChange={setIsAnnual}
          />
          <span className={isAnnual() ? 'billing-label text-sm font-medium text-foreground' : 'billing-label text-sm font-medium text-muted-foreground'}>
            Annual
          </span>
          {/* Badge conditional from signal */}
          {isAnnual() ? (
            <Badge variant="default" className="savings-badge">Save {savingsPercent()}%</Badge>
          ) : null}
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="pricing-cards grid grid-cols-1 md:grid-cols-3 gap-6">
        {displayPlans().map(plan => (
          <Card
            key={plan.id}
            className={`pricing-card relative ${plan.recommended ? 'border-primary shadow-lg ring-1 ring-primary' : ''}`}
          >
            {plan.recommended ? (
              <Badge variant="default" className="popular-badge absolute -top-3 left-1/2 -translate-x-1/2">Most Popular</Badge>
            ) : null}

            <CardHeader className="text-center">
              <CardTitle className="plan-name">{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
              <div className="mt-4">
                {/* Signal-driven price display */}
                <span className="price-amount text-4xl font-bold">
                  {isAnnual() ? formatPrice(plan.annualPrice) : formatPrice(plan.monthlyPrice)}
                </span>
                <span className="price-period text-muted-foreground text-sm ml-1">
                  {isAnnual() ? '/mo billed annually' : '/month'}
                </span>
              </div>
              {/* Original price strikethrough when annual */}
              {isAnnual() && plan.monthlyPrice > 0 ? (
                <p className="original-price text-sm text-muted-foreground line-through">
                  {formatPrice(plan.monthlyPrice)}/mo
                </p>
              ) : null}
            </CardHeader>

            <CardContent>
              <Separator />
              <ul className="feature-list mt-4 space-y-2">
                {plan.highlights.map(feature => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <span className="text-primary shrink-0">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter>
              <Button
                variant={plan.recommended ? 'default' : 'outline'}
                className="cta-button w-full"
                onClick={() => setSelectedPlan(plan.id)}
              >
                {plan.cta}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Selected plan feedback */}
      {selectedPlan() ? (
        <p className="selected-feedback text-center text-sm text-muted-foreground">
          Selected: <span className="font-medium text-foreground selected-plan-name">{selectedPlan()}</span>
          {' — '}{isAnnual() ? 'billed annually' : 'billed monthly'}
        </p>
      ) : null}

      <Separator />

      {/* Feature Comparison Table — 3-level nested loop */}
      <div className="comparison-table">
        <h3 className="text-xl font-semibold text-center mb-6">Feature Comparison</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 font-medium">Feature</th>
                <th className="text-center py-3 px-4 font-medium">Free</th>
                <th className="text-center py-3 px-4 font-medium">Pro</th>
                <th className="text-center py-3 px-4 font-medium">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {allFeatures.map(feature => (
                <tr key={feature.id} className="feature-row border-b">
                  <td className="py-3 px-4">{feature.name}</td>
                  {/* Nested ternary: typeof + boolean conditional */}
                  <td className="text-center py-3 px-4">{featureValue(feature.free)}</td>
                  <td className="text-center py-3 px-4">{featureValue(feature.pro)}</td>
                  <td className="text-center py-3 px-4">{featureValue(feature.enterprise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
