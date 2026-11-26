import { eventIterator, oc } from '@orpc/contract'
import * as z from 'zod'

const profileSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
})

export const contract = {
  profile: {
    get: oc.output(profileSchema),
    update: oc.input(profileSchema).output(profileSchema),
  },
  diagnostics: {
    stream: oc.input(z.object({
      count: z.int().min(1).max(20),
    }))
      .output(eventIterator(z.object({
        sequence: z.int(),
        token: z.string(),
      }))),
    retry: oc.output(z.string()),
  },
}
