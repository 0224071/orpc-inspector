import { implement, ORPCError } from '@orpc/server'
import { contract } from '#shared/contract'

const os = implement(contract)

let profile = { name: 'Ming Wang', email: 'ming@example.com' }

export const router = os.router({
  profile: {
    get: os.profile.get.handler(() => profile),
    update: os.profile.update.handler(({ input }) => {
      if (input.email.endsWith('@taken.example'))
        throw new ORPCError('CONFLICT', { message: 'Email is already in use' })
      profile = input
      return profile
    }),
  },
})
