---
name: polish-pr
description: Finish BarefootJS PRs by addressing CI failures and Pullfrog reviews through current-head verification and one final human notification. Use for PR polish or blocker removal, not a read-only review or status request.
---

# Polish a PR

Drive the requested PR to verified readiness, not merely "ready for review".
This is a shared, instruction-only skill for Claude and Codex. Both follow this
same file; it does not require Codex app tools or a Claude Workflow runtime.
Read root `AGENTS.md` and `.github/pullfrog/review.md` completely before acting.
Use available GitHub tools or `gh`; no particular harness or model is required.
A status-only or read-only review request authorizes inspection, not this skill's
mutations. Finishing does not authorize merging or unrelated fixes.

## Host capabilities

- Read/edit files and run commands using the current agent's own tools. For
  GitHub operations use an available connector/MCP tool or authenticated `gh`
  through its shell tool; the required evidence and completion gates are identical.
- PR attachment to a chat is optional UI bookkeeping. If the host has no such
  tool, retain the PR URL in working notes; attachment is never a completion gate.
- Use review/simplification skills when available (including Claude's existing
  skills), otherwise perform those passes inline using the repository rubric.
  Do not depend on a particular tool name, agent launcher, or model setting.
- Use event/wait tools when available, otherwise inspect GitHub with `gh` and
  poll with backoff. If later monitoring is requested but the host cannot schedule
  it, disclose that limitation; do not pretend a persistent monitor was started.

## Establish ownership and state

Resolve the PR, actual base branch, remote head SHA, and local checkout. Record
the PR URL and optionally attach it if supported. Preserve unrelated work. For a
stack, process bottom-up and propagate lower-layer fixes before reviewing upper diffs.

Keep a compact evidence record in working notes: PR/base/head, local validation
commands and results, latest Pullfrog-reviewed SHA, findings/threads, applicable
CI and drift checks, mergeability, and whether the final mention was posted.
Refresh it after every push; never combine results from different heads.

## Review, simplify, and trigger review

- Read the cumulative diff against the PR's actual base. Review correctness and
  the repository design/testing contracts; a self-assessment of "clean" is not
  independent evidence. Available review skills may help, but inline review is
  a valid fallback. Do not spawn agents or switch models without authorization.
- Simplify only changed code: shared decisions, clarity, and unnecessary work.
  Avoid unrelated cleanup. Verify real entry-point assumptions and meaningful
  tests, changesets, limitation graduation, and generated-artifact diffs.
- Run the affected full layer suites plus targeted regressions. When a local
  failure appears unrelated, reproduce it on the base before calling it
  pre-existing. Missing tools or a skipped runtime are not a passing runtime
  test; obtain evidence from that backend's CI and disclose local limitations.
- Push fixes and update the PR description to the actual diff. Undraft when the
  initial review pass is complete so Pullfrog can run asynchronously. Undrafting
  is a trigger, not the final completion gate; do not mention the human yet.

## Own the CI and Pullfrog loop

Use the host's event/wait mechanism when available; otherwise poll with backoff.
Keep waits bounded and give concise progress updates without narrating unchanged
polls. Long-running adapter jobs are expected, not evidence of a blocker. Use
the provided scheduling mechanism if the user requests later monitoring.

For each actionable CI/review finding:

1. Re-diff against the current head and verify the finding is still applicable.
   Inspect failed job logs, not only the summary or an older run's failure.
2. Add a repro at the correct layer, fix the root decision, verify, commit, and
   push. New divergences found during this work need executable evidence, not
   speculative registry entries or broad late-stage cleanup.
3. Reply with the fix and verification; resolve an inline thread only after its
   finding is addressed or a reasoned disagreement is documented. Check review
   bodies as well as threads: a blocking finding can exist without an inline thread.
4. Wait for review of the NEW head and all applicable checks again. Every push,
   rebase, or lower-stack fix invalidates stale approval and CI evidence.

Do not blindly rerun failures. If the failure is infrastructure-related, verify
that diagnosis, retry the affected job, and inspect the result. Do not weaken
tests, alter expectations to match a defect, or silently skip failed checks.
If a permission, dependency, product decision, or external coordination is needed,
report the precise blocker and ask for direction; persistence does not expand scope.

## Final gate — same immutable head

Before notifying the human, establish ALL of the following on the current SHA:

- Pullfrog has actually reviewed this SHA, with no unresolved blocking findings.
  A green `pullfrog` check alone, old review, undraft event, or bot launch comment
  is not sufficient. "No new issues" also requires earlier blockers to be addressed.
- All applicable latest CI checks pass. Distinguish intentional path-filter/opt-in
  skips from missing validation; check job names together with their workflows
  because many adapters have a job called `test`.
- For changes covered by fixture drift, `update-expected-html` succeeds **by name**
  on this head. Green unrelated jobs or a missing applicable drift job are not a
  substitute. Use the local generator procedure in `AGENTS.md` if needed.
- For a `main`-based PR, `heavy-ci-ran` succeeds. A stacked PR's light CI is not
  evidence that it is ready to merge into `main` after retargeting.
- There is no merge conflict. Inspect `mergeStateStatus` as well as `mergeable`.
  If `UNSTABLE` remains despite green latest checks, inspect every rollup entry:
  duplicate cancelled runs may survive concurrency. Verify a successful run at
  the same SHA/workflow; rerun the affected cancelled gate if appropriate, then
  recheck. Never assume the aggregate means either success or a code defect.
- Personally reread the FINAL cumulative diff after all fixups. Confirm it matches
  the requested contract, with real pipeline tests, correct changesets/registry
  pointers, and no unreported silent gap. The intended work is committed/pushed;
  no uncommitted exploratory change is being presented as part of the verified PR.
- Re-fetch the remote head before posting. No push has landed since the reviewed
  SHA or verified checks. If it changed, repeat the invalidated gates.

## Notify once and hand off

Check existing PR comments and task notes before posting to avoid a duplicate
ready notification after a resumed session. Only after the final gate, post ONE
comment starting with `@kfly8` (or the maintainer explicitly requested by the user):

- **What:** actual changes and any remaining scoped limitations.
- **How to verify:** exact runnable commands/manual repro, including what review
  and simplification changed.
- **Expected result:** concrete output or behavior, not "it works".

Amend a previously drafted comment when fixups changed the diff or commands.
Do not request the PR author as their own reviewer. Avoid duplicating an
attribution footer automatically added by a tool. If attribution is used, name
the actual executing agent; do not copy another host's signature. Commit author
and co-author rules are defined once in `AGENTS.md`, for both Claude and Codex.
Report the PR link, current-head CI/review outcome, and whether it was merged.
Leave merging to the user unless explicitly requested.

## Reusable task prompt

> Follow the shared polish-pr skill for <PR URL>. Address CI and Pullfrog findings
> until the current head passes all applicable checks, has no review blockers or
> conflicts, and the final cumulative diff is verified. Notify the maintainer once
> after those gates; do not merge. Report any blocker requiring my decision.
