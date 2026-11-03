import { http, HttpResponse } from 'msw'

/** Leading `*` matches both the browser (relative path) and SSR (http://localhost) */
export const PROFILE_URL = '*/api/profile'
export const ORDERS_URL = '*/api/orders'
export const ORDERS_SEARCH_URL = '*/api/orders/search'
export const ORDER_DETAIL_URL = '*/api/orders/:id'

export const profile = {
  name: 'Ming Wang',
  email: 'ming@example.com',
  mobile: '0912345678',
  locale: 'zh-TW',
}

/** Echo the query string as-is to compare against the format actually sent */
export function echoQuery(url: string) {
  const query: Record<string, string | string[]> = {}
  for (const [key, value] of new URL(url).searchParams) {
    const prev = query[key]
    query[key] = prev === undefined
      ? value
      : [prev, value].flat()
  }
  return query
}

export function echoDetail(request: Request, id: string) {
  return {
    id,
    requestId: request.headers.get('x-request-id'),
    tenant: request.headers.get('x-tenant'),
    expand: new URL(request.url).searchParams.get('expand'),
  }
}

export const handlers = [
  http.get(PROFILE_URL, () => HttpResponse.json(profile)),
  http.patch(PROFILE_URL, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    if (body.mobile === '0900000000')
      return HttpResponse.json({ code: 'MOBILE_TAKEN', message: 'Mobile number is already in use' }, { status: 409 })
    if (body.name === 'fail-test')
      return HttpResponse.json({ code: 'INTERNAL', message: 'Unexpected error' }, { status: 500 })
    return HttpResponse.json({
      ...profile,
      ...body,
    })
  }),
  http.get(ORDERS_URL, () => HttpResponse.json({
    customer: {
      name: 'Ming Wang',
      contact: {
        email: 'ming@example.com',
        phones: ['0912345678'],
      },
    },
    orders: [
      {
        id: 'A001',
        items: [
          { sku: 'SKU-1', qty: 2, price: 100 },
        ],
        shipping: {
          address: { city: 'Taipei', zip: '100' },
        },
      },
    ],
  })),
  http.get(ORDERS_SEARCH_URL, ({ request }) => HttpResponse.json({
    query: echoQuery(request.url),
    items: [
      { id: 'A001', total: 1200 },
    ],
  })),
  http.get(ORDER_DETAIL_URL, ({ request, params }) =>
    HttpResponse.json(echoDetail(request, String(params.id)))),
]
