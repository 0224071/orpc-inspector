/**
 * Each scenario makes one oRPC call to the Nuxt server routes, producing one record for the panel.
 * Same shape as the vite-vue playground's scenarios; the list itself is separate.
 */
import type { ContractRouterClient } from '@orpc/contract'
import type { contract } from '#shared/contract'

export type Outcome = 'success' | 'input' | 'http'

export const OUTCOME_LABELS: Record<Outcome, string> = {
  success: 'Success',
  input: 'Input validation',
  http: 'HTTP error',
}

export interface Scenario {
  key: string
  label: string
  expect: string
  procedure: string
  method: 'POST'
  path: string
  /** Anything but `success` is expected to throw; an error there is the intended result */
  outcome: Outcome
  run: () => Promise<unknown>
}

export interface ScenarioResult {
  ok: boolean
  text: string
}

export function isAsExpected(outcome: Outcome, result: ScenarioResult) {
  return result.ok === (outcome === 'success')
}

export async function runScenario(run: () => Promise<unknown>): Promise<ScenarioResult> {
  try {
    return {
      ok: true,
      text: JSON.stringify(await run()),
    }
  }
  catch (error) {
    return {
      ok: false,
      text: error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error),
    }
  }
}

/** `validatingClient` validates against the contract on the client, so its records carry zod issues */
export function createScenarios(
  client: ContractRouterClient<typeof contract>,
  validatingClient: ContractRouterClient<typeof contract>,
): Scenario[] {
  return [
    {
      key: 'get-ok',
      label: 'GET success',
      expect: '200, returns the current profile',
      procedure: 'profile.get',
      method: 'POST',
      path: '/rpc/profile/get',
      outcome: 'success',
      run: () => client.profile.get(),
    },
    {
      key: 'update-400',
      label: 'Server 400 input validation error',
      expect: 'name too short; the server rejects the input with 400',
      procedure: 'profile.update',
      method: 'POST',
      path: '/rpc/profile/update',
      outcome: 'input',
      run: () => client.profile.update({ name: 'X', email: 'ming@example.com' }),
    },
    {
      key: 'update-client-invalid',
      label: 'Client input validation error',
      expect: 'name too short and email invalid; blocked client-side, not sent',
      procedure: 'profile.update',
      method: 'POST',
      path: '/rpc/profile/update',
      outcome: 'input',
      run: () => validatingClient.profile.update({ name: 'X', email: 'not-an-email' }),
    },
    {
      key: 'update-409',
      label: '409 business error',
      expect: 'Email is already in use',
      procedure: 'profile.update',
      method: 'POST',
      path: '/rpc/profile/update',
      outcome: 'http',
      run: () => client.profile.update({ name: 'Ming Wang', email: 'ming@taken.example' }),
    },
  ]
}
