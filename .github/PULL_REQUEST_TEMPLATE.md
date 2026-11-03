<!--
Behavior changes need an OpenSpec change in `openspec/changes/<name>/` (see CONTRIBUTING.md).
Typo fixes, docs, tests and refactors without behavior changes do not.
Bug fixes do not either, as long as they match what the existing specs require. Add a test that fails without the fix.
-->

## OpenSpec change

<!-- e.g. `openspec/changes/add-request-timing/`, or "none" with the reason (e.g. "bug fix, matches openspec/specs/call-recording") -->

## Summary

<!-- What this PR does, in one or two sentences -->

## Review order

1. `proposal.md`: is this the right problem and scope?
2. Delta specs under `specs/`: is "done" defined correctly?
3. Code diff: does it deliver exactly those requirements?

## Checklist

- [ ] `pnpm check` passes (build, lint, typecheck, test, `openspec validate`)
- [ ] All tasks in `tasks.md` are checked
- [ ] The change is **not** archived (maintainers archive after merge)
- [ ] README updated if the public API or setup changed
