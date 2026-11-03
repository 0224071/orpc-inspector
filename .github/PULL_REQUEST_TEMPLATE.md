<!--
Behavior changes need an OpenSpec change in `openspec/changes/<name>/` (see CONTRIBUTING.md).
Typo fixes, docs, tests and refactors without behavior changes do not.
-->

## OpenSpec change

<!-- e.g. `openspec/changes/add-request-timing/`, or "none" with the reason -->

## Summary

<!-- What this PR does, in one or two sentences -->

## Review order

1. `proposal.md`: is this the right problem and scope?
2. Delta specs under `specs/`: is "done" defined correctly?
3. Code diff: does it deliver exactly those requirements?

## Checklist

- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass
- [ ] `openspec validate --all --strict` passes
- [ ] All tasks in `tasks.md` are checked
- [ ] The change is **not** archived (maintainers archive after merge)
- [ ] README updated if the public API or setup changed
