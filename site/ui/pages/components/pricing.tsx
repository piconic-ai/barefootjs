/**
 * Pricing Reference Page (/components/pricing)
 */

import { PricingDemo } from '@/components/pricing-demo'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  type TocItem,
} from '../../components/shared/docs'

const previewCode = `"use client"

import { createSignal, createMemo } from '@barefootjs/dom'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

export function Pricing() {
  const [isAnnual, setIsAnnual] = createSignal(false)
  const savings = createMemo(() => isAnnual() ? 20 : 0)

  return (
    <div>
      <Switch checked={isAnnual()} onCheckedChange={setIsAnnual} />
      {isAnnual() ? <Badge>Save {savings()}%</Badge> : null}

      {plans.map(plan => (
        <Card key={plan.id}>
          <CardHeader>
            <span>{plan.name}</span>
            <span>
              {isAnnual() ? formatPrice(plan.annualPrice) : formatPrice(plan.monthlyPrice)}
            </span>
          </CardHeader>
          <CardContent>
            {plan.highlights.map(f => <li key={f}>✓ {f}</li>)}
          </CardContent>
          <CardFooter>
            <Button>{plan.cta}</Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}`

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'features', title: 'Features' },
  { id: 'billing', title: 'Billing Toggle', branch: 'start' },
  { id: 'comparison', title: 'Feature Comparison', branch: 'end' },
]

export function PricingRefPage() {
  return (
    <DocPage slug="pricing" toc={tocItems}>
      <PageHeader
        title="Pricing"
        description="SaaS pricing page with billing toggle, plan cards, and feature comparison."
      />

      <Section id="preview" title="Preview">
        <Example code={previewCode}>
          <PricingDemo />
        </Example>
      </Section>

      <Section id="features" title="Features">
        <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
          <li>Signal-driven ternary for price display (monthly/annual)</li>
          <li>One signal fans out to ~10 DOM updates</li>
          <li>Computed savings memo with conditional badge</li>
          <li>Feature comparison table with boolean/string conditionals</li>
          <li>Plan selection feedback combining two signals</li>
        </ul>
      </Section>

      <Section id="billing" title="Billing Toggle">
        <p className="text-sm text-muted-foreground">
          A single <code>isAnnual</code> signal drives price text, billing labels, save badge,
          card classes, and strikethrough prices across all 3 plan cards simultaneously.
        </p>
      </Section>

      <Section id="comparison" title="Feature Comparison">
        <p className="text-sm text-muted-foreground">
          Feature table renders boolean values as ✓/— and string values as text,
          using a nested ternary pattern (<code>typeof val === 'boolean' ? ... : val</code>).
        </p>
      </Section>
    </DocPage>
  )
}
