# Local development

## Tool versions

Node, pnpm and the OpenSpec CLI versions are pinned in `mise.toml`; CI reads the same file via `jdx/mise-action`. After the first clone, run `mise trust` and `mise install`.

## Playgrounds and ports

| Command | URL | Notes |
|---|---|---|
| `pnpm -F @playground/vite-vue dev` | http://localhost:5173/ | Vite + Vue, `devtools: true` |
| `pnpm -F @playground/vite-vue dev:ssr` | http://localhost:5174/ | `server.js`, SSR with Vite middleware mode (change the port with `PORT`) |
| `pnpm -F @playground/nuxt dev` | http://localhost:3000/ | Nuxt 4 |

Vite DevTools also opens 9999 / 10000. `vite build` opens them too when `devtools: true`, so the build never exits on its own.

## Production builds with the inspector

| Build | Serve | URL |
|---|---|---|
| `pnpm -F @playground/vite-vue build:inspector` | `pnpm -F @playground/vite-vue preview:inspector` | http://localhost:4173/ |
| `pnpm -F @playground/vite-vue build:inspector:ssr` | `pnpm -F @playground/vite-vue start:inspector:ssr` | http://localhost:4174/ (`server.prod.js`, change with `PORT`) |
| `pnpm -F @playground/nuxt build:inspector` | `pnpm -F @playground/nuxt start` | http://localhost:3000/ (change with `PORT`) |

- The Vite playground opts in with `--mode inspector` (`production: true`, `zodLocale: 'zh-TW'`). It adds Vite DevTools as the `DevTools()` plugin rather than Vite's `devtools` option, because with the option `vite build` starts the DevTools server after building and never exits; the plugin form exits. The plain `vite build` (no mode) still uses `devtools: true` and does not exit; stop it after the output is written.
- The SSR build runs the server build first, then the client build. The server output also gets a `__devtools/` folder from Vite DevTools; it is not served.
- The Nuxt playground opts in with `--envName inspector` (`$env.inspector` in `nuxt.config.ts`). `pnpm -F @playground/nuxt build` builds without the inspector.
- To check `app.baseURL`, build Nuxt with `NUXT_APP_BASE_URL=/app/`. In Git Bash also set `MSYS_NO_PATHCONV=1`, otherwise `/app/` becomes a Windows path. The playground's own oRPC calls use `/rpc` and fail under `/app/`; the dock and panel still load.
- No devframe authorization is needed: the dock reads a static RPC dump. The dock badge works in the static hub (checked 2026-10-31).
- The hub's RPC dump keeps the same file names between builds; after rebuilding with a different base, reload with the cache disabled or the dock may point to the old panel URL.

## Starting from an agent

- Redirect output to `.tmp/<name>.log` and set `NO_COLOR=1` so the log has no color codes:
  `NO_COLOR=1 pnpm -F @playground/vite-vue dev > .tmp/vite-vue-dev.log 2>&1`
- If the log still has color codes (devframe's blocks may ignore `NO_COLOR`), read it with `node scripts/strip-ansi.mjs .tmp/<name>.log`.
- The playgrounds serve the panel from `packages/orpc-inspector/dist`. After changing anything under `panel/` or `src/`, run `pnpm build` and reload the page; otherwise you are looking at the old build.
- Driving the dock with chrome-devtools MCP or other automation: when no panel is open and the mouse hasn't moved over the dock for 3 seconds (`inactiveTimeout`), the dock collapses into a small block (`#devframes-anchor`) that only expands on `mousemove`, and a click sent while it is collapsed misses whichever dock button you target, not just oRPC. On the block it only expands the dock and shows a tooltip; outside the block (the Nuxt oRPC button can sit there) nothing happens at all. Hover the collapsed block (`#devframes-anchor`), not the button, wait about half a second for the dock to expand, then click the button; the panel iframe then shows up in `take_snapshot`.
- The Nuxt playground uses Nuxt DevTools v4 (built on Vite DevTools), so the panel is the dock's oRPC entry and needs the same devframe authorization as below. Only the "Client input validation error" scenario records zod issues: it runs on a separate client with `RequestValidationPlugin`; the main client sends invalid input to the server instead.
- Find what holds a port: `node scripts/ports.mjs [port...]` (Windows only; without arguments it checks the ports in the table above). Stop it with `Stop-Process` on that pid.

## devframe auth code

The first time the dock opens, the panel must be authorized:

1. Click the dock's **Unauthorized** button on the page; only then is the code printed in the dev server log: `auth code 123456`, or a `#devframe_otp=123456` link.
2. The code expires after about 5 minutes. Once expired, click **Re-issue one-time password** in the authorization dialog and read the log again for the new code. (The dock follows the browser language, so these labels may be localized.) If authorization times out, the server log shows `Timeout waiting for rpc to be trusted`.
3. On 5174 (middleware mode) the magic link has the wrong port (it points to 5173); enter the code manually on the 5174 page.

## Dependencies

- For installing Nuxt DevTools v4, see the Nuxt section of the README: install it directly as a devDependency. Don't use pnpm `overrides`; pnpm 10 hangs while resolving dependencies.
- `pnpm-workspace.yaml` enables `trustPolicy: no-downgrade`. If an install is blocked, ask the user first; don't add `trustPolicyExclude` on your own.
