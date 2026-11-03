# Contributing

Thanks for your interest in orpc-inspector! Bug reports, docs fixes and pull requests are all welcome.

This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md). By taking part, you agree to follow it.

## Setup

Tool versions (Node.js, pnpm, OpenSpec CLI) are pinned in [`mise.toml`](./mise.toml). With [mise](https://mise.jdx.dev):

```sh
mise install
pnpm install
pnpm build
```

Without mise, install the Node.js and pnpm versions listed in `mise.toml`, and the OpenSpec CLI with `npm i -g @fission-ai/openspec@<version>`.

## Development

| Command | What it does |
|---|---|
| `pnpm build` | Build `orpc-inspector` (library and panel) |
| `pnpm lint` / `pnpm lint:fix` | ESLint ([@antfu/eslint-config](https://github.com/antfu/eslint-config)) |
| `pnpm typecheck` | Type-check all packages |
| `pnpm test` / `pnpm test:watch` | Vitest. Some tests use the built package, so run `pnpm build` after changing `src/` or `panel/` |
| `pnpm check` | Build, then run every check CI runs (lint, typecheck, test, `openspec validate`) |
| `pnpm -F @playground/vite-vue dev` | Vite + Vue playground |
| `pnpm -F @playground/nuxt dev` | Nuxt playground |

Playground ports and the devframe auth flow are described in [`docs/dev.md`](./docs/dev.md).

A pre-commit hook runs ESLint on staged files, and a commit-msg hook checks the commit message format.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org). Release notes are generated from them and published in [GitHub Releases](https://github.com/0224071/orpc-inspector/releases).

```
<type>(<optional scope>): <subject>
```

The commit-msg hook runs [commitlint](https://commitlint.js.org) with `@commitlint/config-conventional`.

Types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`. Add `!` after the type for breaking changes, e.g. `feat(nuxt)!: require Nuxt 4.2`. Start the subject with a lowercase word (`feat(nuxt): support …`, not `feat(nuxt): Nuxt …`), and keep the header within 100 characters.

## Planning with OpenSpec

Behavior changes are planned with [OpenSpec](https://github.com/Fission-AI/OpenSpec) before code is written. Specs describe how the inspector behaves today (`openspec/specs/`); a change proposes how it should behave next (`openspec/changes/<name>/`).

**You need a change** for new features, behavior changes and breaking changes.
**You do not need one** for typo fixes, docs, tests, dependency bumps or refactors that keep behavior the same.
**Bug fixes** do not need one when they make the inspector behave the way `openspec/specs/` already requires or intends. Add a test that fails without the fix. If the fix changes what a spec requires, it is a behavior change and needs a change.

For larger ideas, open an issue first so we can agree on the direction before you write a proposal.

### The workflow

One change maps to one branch and one pull request:

```
git switch -c add-request-timing    start a branch
        │
propose                             write proposal.md, delta specs, design.md, tasks.md
        │
review the plan yourself            before any code
        │
apply                               implement; check off tasks.md as you go
        │
open a PR                           the PR contains the delta specs AND the code
        │
review, merge
        │
archive (maintainers)               fold the deltas into specs/, move the change to archive/
```

The repo ships OpenSpec commands for AI coding assistants (`.claude/`, `.agents/`): `/opsx:propose`, `/opsx:apply`, `/opsx:verify`. You can also write the files by hand; `openspec show <change>` and `openspec validate <change> --strict` help you check them.

### Rules

- **One change, one owner.** Do not edit someone else's change folder. If your work overlaps, propose a separate change.
- **Keep changes small.** A change should fit one pull request. Split big features into several changes.
- **Do not archive in your PR.** Maintainers archive changes after they are merged, so `openspec/specs/` only moves forward with work that actually shipped, and parallel PRs do not conflict in `specs/`.
- **Write in English**, including OpenSpec artifacts.

### Reviewing a pull request

Read in this order:

1. `proposal.md`: is this the right problem and scope?
2. Delta specs under `openspec/changes/<name>/specs/`: is "done" defined correctly?
3. The code diff: does it deliver exactly those requirements?

Disagree with the approach on the proposal, before going through the code.

### Archiving (maintainers)

After a change is merged to `main`, archive it in a follow-up PR (`/opsx:archive` or `openspec archive <name>`), titled `chore(openspec): archive <name>`. Several merged changes can be archived together (`/opsx:bulk-archive`). If two changes modified the same requirement, resolve the conflict in `openspec/specs/` so it reflects the shipped behavior.

## Pull requests

- Base your branch on `main` and keep it focused on one change.
- Add or update tests for behavior changes.
- Make sure `pnpm check` passes. It builds first, then runs `pnpm lint`, `pnpm typecheck`, `pnpm test` and `openspec validate --all --strict`, the same checks as CI.
- Update the README (setup) or `docs/guide/` (everything else), in both English and Traditional Chinese, when the public API or the setup steps change.

## Releasing (maintainers)

A release is one command on your machine. Everything after the tag push runs in [`release.yml`](./.github/workflows/release.yml).

### One-time setup

1. Make the GitHub repo public. npm provenance does not work for private repos.
2. On npmjs.com, add a trusted publisher for `orpc-inspector`: GitHub Actions, repo `0224071/orpc-inspector`, workflow `release.yml`.

If npm does not let you add a trusted publisher before the package exists, do the first release this way:

1. Run `pnpm release` and choose the version. The release job runs and fails at the publish step.
2. Check out the tag, then run `pnpm install --frozen-lockfile`, `pnpm build` and `npm login`.
3. Run `pnpm -F orpc-inspector publish --no-git-checks`.
4. Add the trusted publisher on npmjs.com.
5. Rerun the release job. It skips publish because the version is already on npm, and creates the GitHub Release.

### Cutting a release

1. Switch to `main` and pull, so your local branch matches GitHub.
2. Run `pnpm release` and choose the version. bumpp updates `packages/orpc-inspector/package.json`, commits `chore: release vX.Y.Z`, tags `vX.Y.Z` and pushes both.
3. Watch the Release workflow on GitHub Actions. It runs build, lint, typecheck, test and `openspec validate`, publishes to npm, then creates the GitHub Release.

If a check fails, nothing is published, and `main` already holds the version bump. Delete the tag (`git tag -d vX.Y.Z` and `git push origin :refs/tags/vX.Y.Z`), push the fix to `main`, then tag the fixed commit again (`git tag vX.Y.Z` and `git push origin vX.Y.Z`).

If the job fails after publishing, rerun it. The publish step is skipped when the version is already on npm.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
