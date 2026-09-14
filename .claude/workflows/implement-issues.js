// Plan → implement → polish one or more GitHub issues into stacked PR(s) for this repo.
//
// Usage: Workflow({ name: 'implement-issues', args: { issues: [123, 456], repo: 'piconic-ai/barefootjs' } })
//   args.issues — required, array of issue numbers (numbers, "#123", or full issue URLs all work)
//   args.repo   — optional, "owner/repo", defaults to piconic-ai/barefootjs
//
// No reviewer-assignment step: this session's GitHub credentials author every PR it opens
// (as "kfly8" in this repo), and GitHub refuses to let a PR's own author be requested as
// its reviewer — there is no reviewer to assign that isn't already the author. Instead,
// once a PR is polished and ready for review, the Polish phase posts a PR comment
// @-mentioning kfly8 (a real GitHub notification, distinct from being "the author").
//
// Notifying the human is a two-part handoff: the @kfly8 PR comment is GitHub-side and
// happens inside this script. The CALLER (whichever session invokes this workflow) is
// responsible for the Claude-Code-side half — once this workflow returns, proactively
// notify the user (e.g. via the PushNotification tool) that the returned `prs` are ready
// for review, since a background workflow run may finish while nobody is watching.
//
// What this workflow does NOT do: it does not wait for Pullfrog's review or CI to turn
// green after opening the PR(s) — that is an ongoing, event-driven job (Pullfrog fires on
// its own trigger, CI takes minutes). Once this workflow returns, the caller must
// subscribe_pr_activity on each returned PR and drive it to green using this repo's
// standing "PR you opened" rules (CLAUDE.md's Git Commit section, the pullfrog review
// rubric in .github/pullfrog/review.md, and the harness's own PR-babysitting rules).

export const meta = {
  name: 'implement-issues',
  description: 'Plan, implement, review/simplify, and open stacked PR(s) for one or more GitHub issues',
  phases: [
    { title: 'Fetch', detail: 'read each issue and skim the codebase for likely touch points' },
    { title: 'Plan', detail: 'assess conflict risk and group issues into parallel/serial (stacked) batches', model: 'claude-opus-5' },
    { title: 'Implement', detail: 'implement, test, commit, and open draft PR(s) per group, stacking within a group' },
    { title: 'Polish', detail: 'per group, run code-review + simplify down the PR stack in order, push fixes, and mark each ready for review' },
  ],
}

// Design/planning uses a stronger model per the requester's instruction; implementation
// and polish use Sonnet. Swap DESIGN_MODEL to 'claude-fable-5-1' if Fable is preferred.
const DESIGN_MODEL = 'claude-opus-5'
const IMPLEMENT_MODEL = 'claude-sonnet-5'

function parseIssueNumber(x) {
  if (typeof x === 'number') return x
  const s = String(x)
  // Prefer the /issues/<n> path segment so a comment-anchored issue URL
  // (".../issues/123#issuecomment-456") resolves to 123, not the trailing 456.
  const issuePath = s.match(/\/issues\/(\d+)(?:[/?#]|$)/)
  if (issuePath) return Number(issuePath[1])
  const m = s.match(/(\d+)\s*$/)
  return m ? Number(m[1]) : NaN
}

const repo = (args && args.repo) || 'piconic-ai/barefootjs'
const rawIssues = (args && args.issues) || []
const issues = rawIssues.map(parseIssueNumber).filter((n) => !Number.isNaN(n))

if (issues.length === 0) {
  throw new Error('args.issues must be a non-empty array of issue numbers (or "#123" / issue URLs)')
}

const ISSUE_SCHEMA = {
  type: 'object',
  properties: {
    number: { type: 'number' },
    title: { type: 'string' },
    body: { type: 'string' },
    labels: { type: 'array', items: { type: 'string' } },
    likelyFiles: {
      type: 'array',
      items: { type: 'string' },
      description: 'Files/subsystems this issue will likely touch, based on the issue text and a codebase skim. Do not implement anything yet.',
    },
  },
  required: ['number', 'title', 'body'],
}

phase('Fetch')
const fetched = await parallel(
  issues.map((num) => () =>
    agent(
      `In the GitHub repo ${repo}, fetch issue #${num} (title, full body, labels) using the GitHub MCP tools. ` +
        `Then skim the codebase to guess which files or subsystems this issue will likely touch — do NOT implement anything yet, this is reconnaissance only. ` +
        `Return the issue's number, title, body, labels, and your likelyFiles guess as structured data.`,
      { schema: ISSUE_SCHEMA, phase: 'Fetch', label: `fetch #${num}` },
    ),
  ),
)

const validIssues = fetched.filter(Boolean)
if (validIssues.length === 0) {
  throw new Error(`Could not fetch any of the requested issues from ${repo}: ${issues.join(', ')}`)
}
if (validIssues.length < issues.length) {
  const found = new Set(validIssues.map((i) => i.number))
  const missing = issues.filter((n) => !found.has(n))
  log(`Warning: could not fetch issue(s) ${missing.join(', ')} — continuing with the rest.`)
}

function issueByNumber(n) {
  return validIssues.find((i) => i.number === n)
}

phase('Plan')

let plan
if (validIssues.length === 1) {
  plan = {
    groups: [{ issues: [validIssues[0].number], reason: 'Only one issue was given.' }],
    conflictAnalysis: 'Single issue — no cross-issue conflict analysis needed.',
  }
  log(`Single issue #${validIssues[0].number} — skipping conflict analysis, one group.`)
} else {
  const PLAN_SCHEMA = {
    type: 'object',
    properties: {
      groups: {
        type: 'array',
        description:
          "Ordered list of groups. Groups run in PARALLEL with each other (each starting from the repo's default branch, in its own worktree). Issues within a group run STRICTLY SERIALLY, each PR stacked on the previous one's branch.",
        items: {
          type: 'object',
          properties: {
            issues: { type: 'array', items: { type: 'number' } },
            reason: { type: 'string' },
          },
          required: ['issues', 'reason'],
        },
      },
      conflictAnalysis: { type: 'string' },
    },
    required: ['groups', 'conflictAnalysis'],
  }

  const planPrompt = `
You are planning how to implement the following GitHub issues from ${repo} as pull requests.

Issues (number, title, body, labels, likely files):
${JSON.stringify(validIssues, null, 2)}

Decide:
1. For every pair of issues, whether implementing them risks touching the same files or subsystems (a real conflict risk) — based on likelyFiles, title, and body, and your own knowledge of the codebase's structure.
2. Group the issues into an ORDERED LIST OF GROUPS. Issues in the SAME group are implemented strictly serially, each PR stacked on top of the previous one's branch (later PR's base = earlier PR's branch). Issues in DIFFERENT groups are implemented in parallel, each starting from the repository's default branch in a separate git worktree.
3. Only place issues in different (parallel) groups when you are CONFIDENT they touch disjoint files/areas. If you are unsure, or the risk is ambiguous, keep them in the SAME group (serial) — when in doubt, serial.
4. Every issue must appear in exactly one group.

Return the groups (each with its issue numbers and a one-line reason) plus a short conflictAnalysis paragraph explaining your reasoning across all issues.
`.trim()

  plan = await agent(planPrompt, { schema: PLAN_SCHEMA, phase: 'Plan', model: DESIGN_MODEL, label: 'conflict + grouping plan' })
  log(`Plan: ${plan.groups.length} group(s) — ${plan.conflictAnalysis}`)
}

// The planner is asked to place every issue in exactly one group (PLAN_SCHEMA's own
// invariant), but nothing enforces that a model actually honored it — verify it here the
// same way Fetch verifies its own completeness, rather than trusting the plan blindly.
{
  const counts = new Map()
  for (const group of plan.groups) {
    for (const n of group.issues) counts.set(n, (counts.get(n) || 0) + 1)
  }
  const allNumbers = validIssues.map((i) => i.number)
  const duplicated = [...new Set(allNumbers.filter((n) => (counts.get(n) || 0) > 1))]
  if (duplicated.length > 0) {
    throw new Error(
      `Plan placed issue(s) ${duplicated.join(', ')} in more than one group — refusing to risk duplicate/conflicting PRs.`,
    )
  }
  const missing = allNumbers.filter((n) => !counts.has(n))
  if (missing.length > 0) {
    log(`Warning: plan omitted issue(s) ${missing.join(', ')} — appending them as a trailing serial group.`)
    plan.groups.push({ issues: missing, reason: "Added by validation: the planner's grouping omitted these issues." })
  }
}

phase('Implement')

const GROUP_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    prs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          issueNumbers: { type: 'array', items: { type: 'number' } },
          branch: { type: 'string' },
          baseBranch: { type: 'string' },
          prNumber: { type: 'number' },
          prUrl: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['branch', 'baseBranch', 'prNumber', 'prUrl'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['prs'],
}

function buildImplementPrompt(groupIssues) {
  const issuesText = groupIssues
    .map((i) => `### Issue #${i.number}: ${i.title}\n\n${i.body}`)
    .join('\n\n---\n\n')
  return `
You are implementing the following GitHub issue(s) from ${repo}, in this exact order, as one stack of PRs. This repo's CLAUDE.md is already loaded for you — follow it, especially the "Git Commit" trailer rules and the testing table, and (for compiler/adapter changes) the "Never ..." code conventions and the subset-conformance fixture-coupling rule.

${issuesText}

For each issue above, in order:
1. Create a branch off the current HEAD: the FIRST issue's branch is created off the repository's default branch; each SUBSEQUENT issue's branch is created off the PREVIOUS issue's branch, so the PRs stack.
2. Implement it. If an issue naturally splits into more than one semantic unit of work, split it into multiple sequential commits and multiple stacked PRs instead of one large PR — use judgement, most issues are a single PR. Do not bundle unrelated cleanup into the same commit.
3. Run the relevant tests/typecheck for what you touched and confirm they pass before committing. Follow the CLAUDE.md testing decision guide to pick the right test layer.
4. Commit with correct Co-authored-by trailers per CLAUDE.md's "Git Commit" section.
5. Push the branch with \`git push -u origin <branch>\` and open the PR as a DRAFT via the GitHub MCP tools, with base = the branch from the previous step (or the default branch for the first PR in the stack). Check the repo for a PR template first (there is none at the time of writing, but re-check). Put "Closes #<issue>" in the body for whichever issue(s) that PR resolves.

Return the full list of PRs you opened, in the order you opened them: for each, the issue number(s) it addresses, its branch, its base branch, PR number, PR URL, and title.
`.trim()
}

const groupImplementResults = await parallel(
  plan.groups.map((group, gi) => () => {
    const groupIssues = group.issues.map(issueByNumber).filter(Boolean)
    return agent(buildImplementPrompt(groupIssues), {
      schema: GROUP_RESULT_SCHEMA,
      phase: 'Implement',
      label: `group ${gi + 1} (issues ${group.issues.join(', ')})`,
      model: IMPLEMENT_MODEL,
      isolation: plan.groups.length > 1 ? 'worktree' : undefined,
    })
  }),
)

const allPRs = groupImplementResults.filter(Boolean).flatMap((r) => r.prs || [])
if (allPRs.length === 0) {
  log('No PRs were opened by the implement phase — stopping before polish/land.')
  return { repo, plan, prs: [] }
}
log(`Implement phase opened ${allPRs.length} PR(s): ${allPRs.map((p) => `#${p.prNumber}`).join(', ')}`)

phase('Polish')

const POLISH_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    prNumber: { type: 'number' },
    summary: { type: 'string' },
    pushedFixes: { type: 'boolean' },
    markedReadyForReview: { type: 'boolean' },
    mentionedKfly8: { type: 'boolean' },
  },
  required: ['prNumber', 'summary', 'pushedFixes', 'markedReadyForReview', 'mentionedKfly8'],
}

const POLISH_GROUP_SCHEMA = {
  type: 'object',
  properties: { results: { type: 'array', items: POLISH_ITEM_SCHEMA } },
  required: ['results'],
}

// PRs within a group stack (each based on the previous one's branch). Polishing them with
// one independent agent per PR, all in parallel, would let a lower PR's fixup commit miss
// the higher PRs that already forked from its pre-fix tip and are being polished at the
// same time — the stack would come out needing a manual rebase. So one agent processes an
// entire group's stack itself, in order, in a single worktree, rebasing each PR onto the
// previous one's (possibly just-fixed) tip before reviewing it.
function buildGroupPolishPrompt(groupPRs) {
  const stackList = groupPRs.map((pr, i) => `${i + 1}. PR #${pr.prNumber} — branch "${pr.branch}" (base "${pr.baseBranch}")`).join('\n')
  return `
The following PR(s) in ${repo} form one stack, in this order (each based on the previous):

${stackList}

Process them ONE AT A TIME, IN THIS ORDER, in the same working tree so any fixup commits propagate down the stack:

For each PR, in order:
1. Check out its branch. If it stacks on a PR you already polished earlier in this same task and that PR's branch received fixup commits, rebase (or merge) this branch onto that updated base branch FIRST, resolving any conflicts, before reviewing — do not move on to review until this PR's branch includes the previous PR's fixes.
2. Run the equivalent of the /code-review skill (medium-high effort) against this branch's diff versus its base branch: look for correctness bugs and reuse/simplification/efficiency issues. If the Skill tool is available to you, invoke it with skill "code-review"; otherwise perform the same review inline, using this repo's CLAUDE.md conventions and .github/pullfrog/review.md's rubric as your criteria.
3. Run the equivalent of the /simplify skill on the same diff: apply reuse, simplification, efficiency, and "altitude" cleanups to the changed code ONLY. This step is quality-only — do not go hunting for new bugs, that was the previous step.
4. Apply any fixes directly on the branch, re-run the relevant tests, commit them with correct Co-authored-by trailers, and push — the NEXT PR in the stack depends on this being pushed before you move on.
5. Once you're satisfied this PR is genuinely ready for a human, using the GitHub MCP tools: mark it "ready for review" (undraft it), then post a comment on it that starts with "@kfly8". This is a real GitHub @-mention notification, separate from kfly8 being the PR's author, so make it a self-contained review request, not just a ping — include all of:
   - **What**: one or two sentences on what changed and why.
   - **How to verify**: concrete, runnable steps a reviewer would follow to check the change themselves (exact commands — tests, typecheck, a manual repro — not "review the diff"). If code-review/simplify already ran clean, say so; if they fixed something, name what.
   - **Expected result**: what those steps should show when the change is correct (test output, behavior, absence of a prior symptom) — specific enough that a reviewer knows whether what they see matches, not just "it works".

Return one entry per PR above, in the same order, each with: prNumber, a short summary of what you found and fixed (or "clean — nothing to fix" if there was nothing), whether you pushed any fix commits, whether you marked it ready for review, and whether you posted the @kfly8 comment.
`.trim()
}

const polishGroupResults = await parallel(
  groupImplementResults.map((groupResult, gi) => () => {
    const groupPRs = groupResult && groupResult.prs ? groupResult.prs : []
    if (groupPRs.length === 0) return null
    return agent(buildGroupPolishPrompt(groupPRs), {
      schema: POLISH_GROUP_SCHEMA,
      phase: 'Polish',
      label: `polish group ${gi + 1} (${groupPRs.length}-PR stack)`,
      model: IMPLEMENT_MODEL,
      isolation: 'worktree',
    })
  }),
)

const polishResults = polishGroupResults.filter(Boolean).flatMap((r) => r.results || [])

// The Polish prompt asks each PR to report markedReadyForReview/mentionedKfly8 precisely
// because either can fail — trust those flags instead of assuming every PR succeeded, so a
// PR that's actually still in draft or never got the @kfly8 comment gets called out instead
// of silently reported as done.
const polishedByNumber = new Map(polishResults.map((r) => [r.prNumber, r]))
const fullyDone = []
const needsFollowUp = []
for (const pr of allPRs) {
  const r = polishedByNumber.get(pr.prNumber)
  if (r && r.markedReadyForReview && r.mentionedKfly8) {
    fullyDone.push(pr)
  } else {
    needsFollowUp.push({ pr, result: r })
  }
}

if (needsFollowUp.length > 0) {
  log(
    `Warning: ${needsFollowUp.length} PR(s) still need manual follow-up: ` +
      needsFollowUp
        .map(({ pr, result }) =>
          result
            ? `#${pr.prNumber} (${pr.prUrl}) — markedReadyForReview=${result.markedReadyForReview}, mentionedKfly8=${result.mentionedKfly8}`
            : `#${pr.prNumber} (${pr.prUrl}) — its group's polish agent produced no result for it`,
        )
        .join('; '),
  )
}

log(
  `Done. ${fullyDone.length}/${allPRs.length} PR(s) fully ready for review and @kfly8-mentioned: ${fullyDone.map((p) => p.prUrl).join(', ') || 'none'}. ` +
    `Caller: subscribe_pr_activity on each and drive CI/Pullfrog feedback to green per this repo's standing PR rules, ` +
    `and proactively notify the user now — this script cannot do that part itself.`,
)

return {
  repo,
  plan,
  prs: allPRs,
  polish: polishResults,
  needsFollowUp: needsFollowUp.map(({ pr }) => pr),
}
