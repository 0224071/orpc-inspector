import { oc } from '@orpc/contract'
import * as z from 'zod'

export const LOCALES = ['zh-TW', 'en'] as const

const profileSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  mobile: z.string().regex(/^09\d{8}$/),
  locale: z.enum(LOCALES),
})

export const profileContract = {
  get: oc.route({ method: 'GET', path: '/api/profile' }).output(profileSchema),
  update: oc
    .route({ method: 'PATCH', path: '/api/profile' })
    .input(profileSchema.omit({ email: true }))
    .output(profileSchema),
}

/** Deeply nested contract for producing validation errors at deep paths */
export const ordersContract = {
  list: oc.route({ method: 'GET', path: '/api/orders' }).output(
    z.object({
      customer: z.object({
        name: z.string().min(2),
        contact: z.object({
          email: z.email(),
          phones: z.array(z.string().regex(/^09\d{8}$/)),
        }),
      }),
      orders: z.array(
        z.object({
          id: z.string(),
          items: z.array(
            z.object({
              sku: z.string().min(1),
              qty: z.number().int().positive(),
              price: z.number(),
            }),
          ),
          shipping: z.object({
            address: z.object({
              city: z.string(),
              zip: z.string().regex(/^\d{3,5}$/),
            }),
          }),
        }),
      ),
    }),
  ),
  /** GET input is encoded as a query string */
  search: oc
    .route({ method: 'GET', path: '/api/orders/search' })
    .input(
      z.object({
        keyword: z.string(),
        page: z.coerce.number(),
        status: z.array(z.enum(['paid', 'shipped', 'cancelled'])),
      }),
    )
    .output(
      z.object({
        query: z.record(z.string(), z.union([
          z.string(),
          z.array(z.string()),
        ])),
        items: z.array(z.object({
          id: z.string(),
          total: z.number(),
        })),
      }),
    ),
  /** detailed: input is split into path params, query and headers */
  detail: oc
    .route({ method: 'GET', path: '/api/orders/{id}', inputStructure: 'detailed' })
    .input(
      z.object({
        params: z.object({
          id: z.string(),
        }),
        query: z.object({
          expand: z.string(),
        }).optional(),
        headers: z.object({
          'x-request-id': z.string(),
          'x-tenant': z.string(),
        }),
      }),
    )
    .output(
      z.object({
        id: z.string(),
        requestId: z.string(),
        tenant: z.string(),
        expand: z.string().nullable(),
      }),
    ),
}
