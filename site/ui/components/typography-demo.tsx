/**
 * TypographyDemo Components
 *
 * Demos for Typography components showing realistic content patterns.
 */

import {
  TypographyH1,
  TypographyH2,
  TypographyH3,
  TypographyH4,
  TypographyP,
  TypographyBlockquote,
  TypographyList,
  TypographyInlineCode,
  TypographyLead,
  TypographyLarge,
  TypographySmall,
  TypographyMuted,
} from '@ui/components/ui/typography'

/**
 * Showcase of all typography elements
 */
export function TypographyAllDemo() {
  return (
    <div>
      <TypographyH1>The Joke Tax Chronicles</TypographyH1>
      <TypographyP>
        Once upon a time, in a far-off land, there was a very lazy king who
        spent all day lounging on his throne. One day, his advisors came to him
        with a problem: the kingdom was running out of money.
      </TypographyP>
      <TypographyH2>The King's Plan</TypographyH2>
      <TypographyP>
        The king thought long and hard, and finally came up with{' '}
        <a href="#" className="font-medium text-primary underline underline-offset-4">
          a brilliant plan
        </a>
        : he would tax the jokes in the kingdom.
      </TypographyP>
      <TypographyBlockquote>
        "After all," he said, "everyone enjoys a good joke, so it's only fair
        that they should pay for the privilege."
      </TypographyBlockquote>
      <TypographyH3>The Joke Tax</TypographyH3>
      <TypographyP>
        The king's subjects were not amused. They grumbled and
        complained, but the king was firm:
      </TypographyP>
      <TypographyList>
        <li>1st level of puns: 5 gold coins</li>
        <li>2nd level of jokes: 10 gold coins</li>
        <li>3rd level of one-liners: 20 gold coins</li>
      </TypographyList>
      <TypographyP>
        As a result, people stopped telling jokes, and the kingdom fell into a
        gloom. But there was one person who refused to stop telling
        jokes: the court jester.
      </TypographyP>
      <TypographyH4>People stopped telling jokes</TypographyH4>
      <TypographyP>
        The people of the kingdom, once known for their humor and
        wit, googled{' '}
        <TypographyInlineCode>@radix-ui/react-alert-dialog</TypographyInlineCode>{' '}
        to find a solution.
      </TypographyP>
    </div>
  )
}

/**
 * Article preview showing realistic content layout
 */
export function TypographyArticleDemo() {
  return (
    <article className="max-w-prose">
      <TypographyH2>Introduction to BarefootJS</TypographyH2>
      <TypographyLead>
        A signal-based reactivity framework that compiles JSX to lightweight
        marked templates, bringing modern DX to any backend.
      </TypographyLead>
      <TypographyP>
        BarefootJS takes a fundamentally different approach to frontend
        development. Instead of shipping a full runtime to the browser, it
        compiles your components at build time into minimal client JavaScript.
      </TypographyP>
      <TypographyP>
        The compilation happens in two phases: first, your JSX is transformed
        into an intermediate representation (IR), then the IR is compiled into
        marked templates and client-side JavaScript.
      </TypographyP>
      <TypographyBlockquote>
        "The best JavaScript is the JavaScript you never ship."
      </TypographyBlockquote>
      <TypographyH3>Key Features</TypographyH3>
      <TypographyList>
        <li>Signal-based reactivity with fine-grained updates</li>
        <li>Two-phase compilation for minimal client bundle</li>
        <li>Works with any backend (Hono, Go templates, etc.)</li>
        <li>shadcn/ui-compatible component library</li>
      </TypographyList>
      <TypographyP>
        To get started, install the CLI with{' '}
        <TypographyInlineCode>bun add @barefootjs/cli</TypographyInlineCode>{' '}
        and scaffold your first project.
      </TypographyP>
    </article>
  )
}

/**
 * Inline text styles showcase
 */
export function TypographyInlineDemo() {
  return (
    <div className="space-y-4">
      <TypographyLarge>Are you absolutely sure?</TypographyLarge>
      <TypographyP>
        This action cannot be undone. This will permanently delete your
        account and remove your data from our servers.
      </TypographyP>
      <TypographySmall>Email address</TypographySmall>
      <TypographyMuted>Enter your email address.</TypographyMuted>
    </div>
  )
}
