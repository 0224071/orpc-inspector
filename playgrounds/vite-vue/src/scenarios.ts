/**
 * Each scenario makes one oRPC call, producing one record for the panel.
 * Scenarios like "output mismatch" and "network error" override handlers via MSW network.use() for that call.
 * "Invalid input" is blocked client-side by RequestValidationPlugin; no request is sent.
 */
import type { AnyHandler } from 'msw'
import { http, HttpResponse } from 'msw'
import { network } from 'virtual:msw'
import { client, ordersClient } from './api/client'
import {
  echoDetail,
  echoQuery,
  ORDER_DETAIL_URL,
  ORDERS_SEARCH_URL,
  ORDERS_URL,
  PROFILE_URL,
} from './mocks/handlers'

export type Outcome = 'success' | 'output' | 'input' | 'http' | 'network'

export const OUTCOME_LABELS: Record<Outcome, string> = {
  success: 'Success',
  output: 'Output validation',
  input: 'Input validation',
  http: 'HTTP error',
  network: 'Network error',
}

export interface Scenario {
  key: string
  label: string
  expect: string
  procedure: string
  method: 'GET' | 'PATCH'
  path: string
  /** OrpcInspectorPlugin or createOrpcInspectorInterceptors() */
  wiring: 'plugin' | 'interceptors'
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

/** Apply the override during the call; not `once`, so retries don't hit the default handler */
async function withOverride(handler: AnyHandler, run: () => Promise<unknown>) {
  network.use(handler)
  try {
    return await run()
  }
  finally {
    network.resetHandlers()
  }
}

export async function runScenario(run: () => Promise<unknown>): Promise<ScenarioResult> {
  try {
    const output = await run()
    return {
      ok: true,
      text: JSON.stringify(output),
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

const validInput = { name: 'Ming Wang', mobile: '0912345678', locale: 'zh-TW' } as const

/** 8 errors at various depths, including array elements and missing fields */
const nestedInvalidData = {
  customer: {
    name: 'Ming Wang',
    contact: {
      email: 'not-an-email',
      phones: ['0912345678', '123'],
    },
  },
  orders: [
    {
      id: 'A001',
      items: [
        { sku: 'SKU-1', qty: 2, price: 100 },
        { sku: '', qty: 0, price: '100' },
      ],
      shipping: {
        address: { city: 'Taipei', zip: 'abc' },
      },
    },
    {
      id: 'A002',
      items: [
        { sku: 'SKU-3', qty: 1 },
      ],
      shipping: {
        address: { city: 'Taichung' },
      },
    },
  ],
}

/** All 30 orders lack `shipping.address.zip` and have string `price`, to test array index merging */
const repeatedInvalidData = {
  customer: {
    name: 'Ming Wang',
    contact: { email: 'ming@example.com', phones: [] },
  },
  orders: Array.from({ length: 30 }, (_, i) => ({
    id: `B${String(i).padStart(3, '0')}`,
    items: [
      {
        sku: `SKU-${i}`,
        qty: 1,
        price: String(i * 10),
      },
    ],
    shipping: {
      address: { city: 'Taipei' },
    },
  })),
}

const searchInput = {
  keyword: 'phone',
  page: 2,
  status: ['paid', 'shipped'] as ('paid' | 'shipped')[],
}
/** keyword is not a string, page is not numeric, status[0] is not an allowed value */
const invalidSearchInput = {
  keyword: 1,
  page: 'x',
  status: ['bad'],
} as unknown as typeof searchInput
const detailInput = {
  params: { id: 'A001' },
  query: { expand: 'items' },
  headers: { 'x-request-id': 'req-123', 'x-tenant': 'acme' },
}

export const scenarios: Scenario[] = [
  {
    key: 'get-ok',
    label: 'GET success',
    expect: '200, validation passes',
    procedure: 'profile.get',
    method: 'GET',
    path: '/api/profile',
    wiring: 'plugin',
    outcome: 'success',
    run: () => client.get(),
  },
  {
    key: 'get-invalid',
    label: 'GET output mismatch',
    expect: '200, but name/mobile/locale are invalid and email is missing',
    procedure: 'profile.get',
    method: 'GET',
    path: '/api/profile',
    wiring: 'plugin',
    outcome: 'output',
    run: () => withOverride(
      http.get(PROFILE_URL, () => HttpResponse.json({ name: 'X', mobile: '123', locale: 'xx' })),
      () => client.get(),
    ),
  },
  {
    key: 'get-nested-invalid',
    label: 'GET nested errors',
    expect: '200, 8 errors deep in objects/arrays, including missing fields',
    procedure: 'orders.list',
    method: 'GET',
    path: '/api/orders',
    wiring: 'interceptors',
    outcome: 'output',
    run: () => withOverride(
      http.get(ORDERS_URL, () => HttpResponse.json(nestedInvalidData)),
      () => ordersClient.list(),
    ),
  },
  {
    key: 'get-repeated-invalid',
    label: 'GET same error across a batch',
    expect: '200, all 30 orders lack zip and have wrong price type; panel should merge into 2 entries',
    procedure: 'orders.list',
    method: 'GET',
    path: '/api/orders',
    wiring: 'interceptors',
    outcome: 'output',
    run: () => withOverride(
      http.get(ORDERS_URL, () => HttpResponse.json(repeatedInvalidData)),
      () => ordersClient.list(),
    ),
  },
  {
    key: 'get-query',
    label: 'GET with query params',
    expect: '200, URL has keyword/page/status[0..1]; response echoes the query',
    procedure: 'orders.search',
    method: 'GET',
    path: '/api/orders/search',
    wiring: 'interceptors',
    outcome: 'success',
    run: () => ordersClient.search(searchInput),
  },
  {
    key: 'get-input-invalid',
    label: 'GET invalid input',
    expect: 'Blocked client-side, not sent: keyword, page, status[0] invalid',
    procedure: 'orders.search',
    method: 'GET',
    path: '/api/orders/search',
    wiring: 'interceptors',
    outcome: 'input',
    run: () => ordersClient.search(invalidSearchInput),
  },
  {
    key: 'get-query-invalid',
    label: 'GET query output mismatch',
    expect: '200, items have string total and missing id; report input lists the query',
    procedure: 'orders.search',
    method: 'GET',
    path: '/api/orders/search',
    wiring: 'interceptors',
    outcome: 'output',
    run: () => withOverride(
      http.get(ORDERS_SEARCH_URL, ({ request }) =>
        HttpResponse.json({
          query: echoQuery(request.url),
          items: [
            { total: '1200' },
          ],
        })),
      () => ordersClient.search(searchInput),
    ),
  },
  {
    key: 'get-headers',
    label: 'GET with headers + path',
    expect: '200, sends x-request-id/x-tenant headers, path id, query expand; response echoes them',
    procedure: 'orders.detail',
    method: 'GET',
    path: '/api/orders/{id}',
    wiring: 'interceptors',
    outcome: 'success',
    run: () => ordersClient.detail(detailInput),
  },
  {
    key: 'get-headers-invalid',
    label: 'GET header output mismatch',
    expect: '200, server did not read headers: requestId/tenant are null',
    procedure: 'orders.detail',
    method: 'GET',
    path: '/api/orders/{id}',
    wiring: 'interceptors',
    outcome: 'output',
    run: () => withOverride(
      http.get(ORDER_DETAIL_URL, ({ request, params }) =>
        HttpResponse.json({
          ...echoDetail(request, String(params.id)),
          requestId: null,
          tenant: null,
        })),
      () => ordersClient.detail(detailInput),
    ),
  },
  {
    key: 'get-network',
    label: 'GET network error',
    expect: 'No status, fetch fails',
    procedure: 'profile.get',
    method: 'GET',
    path: '/api/profile',
    wiring: 'plugin',
    outcome: 'network',
    run: () => withOverride(
      http.get(PROFILE_URL, () => HttpResponse.error()),
      () => client.get(),
    ),
  },
  {
    key: 'update-ok',
    label: 'PATCH success',
    expect: '200, validation passes',
    procedure: 'profile.update',
    method: 'PATCH',
    path: '/api/profile',
    wiring: 'plugin',
    outcome: 'success',
    run: () => client.update(validInput),
  },
  {
    key: 'update-input-invalid',
    label: 'PATCH invalid input',
    expect: 'Blocked client-side, not sent: name too short',
    procedure: 'profile.update',
    method: 'PATCH',
    path: '/api/profile',
    wiring: 'plugin',
    outcome: 'input',
    run: () => client.update({ ...validInput, name: 'X' }),
  },
  {
    key: 'update-422',
    label: 'PATCH 422 server validation error',
    expect: 'Input passes client validation, server still returns 422',
    procedure: 'profile.update',
    method: 'PATCH',
    path: '/api/profile',
    wiring: 'plugin',
    outcome: 'http',
    run: () => withOverride(
      http.patch(PROFILE_URL, () =>
        HttpResponse.json({ code: 'VALIDATION', message: 'Profile payload validation failed' }, { status: 422 })),
      () => client.update(validInput),
    ),
  },
  {
    key: 'update-409',
    label: 'PATCH 409 business error',
    expect: 'Mobile number is already in use',
    procedure: 'profile.update',
    method: 'PATCH',
    path: '/api/profile',
    wiring: 'plugin',
    outcome: 'http',
    run: () => client.update({ ...validInput, mobile: '0900000000' }),
  },
  {
    key: 'update-500',
    label: 'PATCH 500 server error',
    expect: 'Unexpected error',
    procedure: 'profile.update',
    method: 'PATCH',
    path: '/api/profile',
    wiring: 'plugin',
    outcome: 'http',
    run: () => client.update({ ...validInput, name: 'fail-test' }),
  },
  {
    key: 'update-400-rest',
    label: 'PATCH 400 non-oRPC error',
    expect: 'The error data carries the response headers; authorization and x-api-key are masked there too',
    procedure: 'profile.update',
    method: 'PATCH',
    path: '/api/profile',
    wiring: 'plugin',
    outcome: 'http',
    run: () => withOverride(
      http.patch(PROFILE_URL, () =>
        HttpResponse.json(
          {
            message: 'Invalid profile',
            errors: {
              mobile: ['is taken'],
            },
          },
          {
            status: 400,
            headers: { 'authorization': 'Bearer rest-secret', 'x-api-key': 'rest-key', 'x-request-id': 'req-1' },
          },
        )),
      () => client.update(validInput),
    ),
  },
]
