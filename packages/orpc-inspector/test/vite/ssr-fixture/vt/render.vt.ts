import { writeFileSync } from 'node:fs'
import process from 'node:process'
import { it } from 'vitest'
import { render } from '../entry-server'

it('reports', async () => {
  const head = await render('vt')
  writeFileSync(process.env.VT_OUT!, head === ''
    ? 'empty'
    : 'records')
})
