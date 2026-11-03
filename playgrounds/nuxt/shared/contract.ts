import { oc } from '@orpc/contract'
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
}
