/**
 * Slider Reference Page (/components/slider)
 *
 * Focused developer reference with interactive Props Playground.
 * Part of the #515 page redesign initiative.
 */

import { Slider } from '@/components/ui/slider'
import { SliderPlayground } from '@/components/slider-playground'
import {
  SliderBasicDemo,
  SliderFormDemo,
  SliderStepDemo,
} from '@/components/slider-demo'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  PropsTable,
  PackageManagerTabs,
  type PropDefinition,
  type TocItem,
} from '../../components/shared/docs'
import { getNavLinks } from '../../components/shared/PageNavigation'

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'installation', title: 'Installation' },
  { id: 'usage', title: 'Usage' },
  { id: 'examples', title: 'Examples' },
  { id: 'basic', title: 'Basic', branch: 'start' },
  { id: 'form', title: 'Form', branch: 'child' },
  { id: 'custom-range', title: 'Custom Range', branch: 'end' },
  { id: 'api-reference', title: 'API Reference' },
]

const usageCode = `"use client"

import { createSignal } from "@barefootjs/dom"
import { Slider } from "@/components/ui/slider"

function SliderDemo() {
  const [volume, setVolume] = createSignal(50)

  return (
    <div className="space-y-6 w-full max-w-sm">
      <div className="space-y-2">
        <span className="text-sm font-medium leading-none">Default</span>
        <Slider />
      </div>
      <div className="space-y-2">
        <span className="text-sm font-medium leading-none">With initial value</span>
        <Slider defaultValue={50} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium leading-none">Controlled</span>
          <span className="text-sm text-muted-foreground tabular-nums">{volume()}%</span>
        </div>
        <Slider value={volume()} onValueChange={setVolume} />
      </div>
      <div className="space-y-2">
        <span className="text-sm font-medium leading-none">Custom range (step=5)</span>
        <Slider min={0} max={100} step={5} defaultValue={50} />
      </div>
      <div className="space-y-2">
        <span className="text-sm font-medium leading-none">Disabled</span>
        <Slider defaultValue={33} disabled />
      </div>
    </div>
  )
}`

const basicCode = `import { Slider } from "@/components/ui/slider"

export function SliderBasicDemo() {
  return (
    <div className="space-y-6 w-full max-w-sm">
      <div className="space-y-2">
        <span className="text-sm font-medium leading-none">Default</span>
        <Slider />
      </div>
      <div className="space-y-2">
        <span className="text-sm font-medium leading-none">With initial value</span>
        <Slider defaultValue={50} />
      </div>
      <div className="space-y-2">
        <span className="text-sm font-medium leading-none">Disabled</span>
        <Slider defaultValue={33} disabled />
      </div>
    </div>
  )
}`

const formCode = `"use client"

import { createSignal, createMemo } from "@barefootjs/dom"
import { Slider } from "@/components/ui/slider"

export function SliderFormDemo() {
  const [brightness, setBrightness] = createSignal(75)
  const [contrast, setContrast] = createSignal(100)
  const [saturation, setSaturation] = createSignal(100)

  const isDefault = createMemo(() =>
    brightness() === 75 && contrast() === 100 && saturation() === 100
  )

  const resetDefaults = () => {
    setBrightness(75)
    setContrast(100)
    setSaturation(100)
  }

  return (
    <div className="space-y-6 w-full max-w-sm">
      <div className="space-y-1">
        <h4 className="text-sm font-medium leading-none">Display Settings</h4>
        <p className="text-sm text-muted-foreground">
          Adjust brightness, contrast, and saturation.
        </p>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">Brightness</span>
            <span className="text-sm text-muted-foreground tabular-nums">{brightness()}%</span>
          </div>
          <Slider value={brightness()} onValueChange={setBrightness} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">Contrast</span>
            <span className="text-sm text-muted-foreground tabular-nums">{contrast()}%</span>
          </div>
          <Slider value={contrast()} max={200} onValueChange={setContrast} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">Saturation</span>
            <span className="text-sm text-muted-foreground tabular-nums">{saturation()}%</span>
          </div>
          <Slider value={saturation()} max={200} onValueChange={setSaturation} />
        </div>
      </div>
      <button
        className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
        disabled={isDefault()}
        onClick={resetDefaults}
      >
        Reset to defaults
      </button>
    </div>
  )
}`

const stepCode = `"use client"

import { createSignal } from "@barefootjs/dom"
import { Slider } from "@/components/ui/slider"

export function SliderStepDemo() {
  const [fontSize, setFontSize] = createSignal(16)
  const [opacity, setOpacity] = createSignal(100)

  return (
    <div className="space-y-6 w-full max-w-sm">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Font Size</span>
          <span className="text-sm text-muted-foreground tabular-nums">{fontSize()}px</span>
        </div>
        <Slider
          value={fontSize()}
          min={8}
          max={32}
          step={1}
          onValueChange={setFontSize}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>8px</span>
          <span>32px</span>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Opacity</span>
          <span className="text-sm text-muted-foreground tabular-nums">{opacity()}%</span>
        </div>
        <Slider
          value={opacity()}
          min={0}
          max={100}
          step={5}
          onValueChange={setOpacity}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>
      <div
        className="rounded-md border border-border p-4 text-center text-sm"
        style={\`font-size: \${fontSize()}px; opacity: \${opacity() / 100}\`}
      >
        Preview text
      </div>
    </div>
  )
}`

const sliderProps: PropDefinition[] = [
  {
    name: 'defaultValue',
    type: 'number',
    defaultValue: '0',
    description: 'The initial value for uncontrolled mode.',
  },
  {
    name: 'value',
    type: 'number',
    description: 'The controlled value of the slider. When provided, the component is in controlled mode.',
  },
  {
    name: 'min',
    type: 'number',
    defaultValue: '0',
    description: 'The minimum value of the slider.',
  },
  {
    name: 'max',
    type: 'number',
    defaultValue: '100',
    description: 'The maximum value of the slider.',
  },
  {
    name: 'step',
    type: 'number',
    defaultValue: '1',
    description: 'The step increment for value changes.',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: 'false',
    description: 'Whether the slider is disabled.',
  },
  {
    name: 'onValueChange',
    type: '(value: number) => void',
    description: 'Event handler called when the slider value changes.',
  },
]

export function SliderRefPage() {
  return (
    <DocPage slug="slider" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Slider"
          description="An input where the user selects a value from within a given range."
          {...getNavLinks('slider')}
        />

        {/* Props Playground */}
        <SliderPlayground />

        {/* Installation */}
        <Section id="installation" title="Installation">
          <PackageManagerTabs command="barefoot add slider" />
        </Section>

        {/* Usage */}
        <Section id="usage" title="Usage">
          <Example title="" code={usageCode}>
            <div className="space-y-6 w-full max-w-sm">
              <div className="space-y-2">
                <span className="text-sm font-medium leading-none">Default</span>
                <Slider />
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium leading-none">With initial value</span>
                <Slider defaultValue={50} />
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium leading-none">Custom range (step=5)</span>
                <Slider min={0} max={100} step={5} defaultValue={50} />
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium leading-none">Disabled</span>
                <Slider defaultValue={33} disabled />
              </div>
            </div>
          </Example>
        </Section>

        {/* Examples */}
        <Section id="examples" title="Examples">
          <div className="space-y-8">
            <Example title="Basic" code={basicCode}>
              <SliderBasicDemo />
            </Example>

            <Example title="Form" code={formCode}>
              <SliderFormDemo />
            </Example>

            <Example title="Custom Range" code={stepCode}>
              <SliderStepDemo />
            </Example>
          </div>
        </Section>

        {/* API Reference */}
        <Section id="api-reference" title="API Reference">
          <PropsTable props={sliderProps} />
        </Section>
      </div>
    </DocPage>
  )
}
