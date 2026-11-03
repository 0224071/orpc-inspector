// Strip ANSI colors, OSC links and border-only lines from a dev log: node scripts/strip-ansi.mjs <log>
import { readFileSync } from 'node:fs'
import process from 'node:process'

const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)
const s = readFileSync(process.argv[2], 'utf8')
  .replace(new RegExp(`${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)`, 'g'), '')
  .replace(new RegExp(`${ESC}\\[[0-9;?]*[a-z]`, 'gi'), '')
console.log(s.split(/\r?\n/).filter(l => !/^[\s│╭╰─╮╯]*$/.test(l)).join('\n'))
