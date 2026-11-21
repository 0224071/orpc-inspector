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
  diagnostics: {
    stream: os.diagnostics.stream.handler(async function* ({ input }) {
      for (let sequence = 0; sequence < input.count; sequence++)
        yield { sequence, token: 'playground-event-token' }
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Stream failed after sending events' })
    }),
    retry: os.diagnostics.retry.handler(() => {
      throw new ORPCError('SERVICE_UNAVAILABLE', { message: 'Playground service is unavailable' })
    }),
  },
})
