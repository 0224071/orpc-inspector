// List which processes are listening on dev ports: node scripts/ports.mjs [port...]
import { execFileSync } from 'node:child_process'
import process from 'node:process'

const ports = process.argv.slice(2).map(Number)
const watch = ports.length
  ? ports
  : [3000, 5173, 5174, 9999, 10000]
const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8' })
const hits = new Map()
for (const line of out.split(/\r?\n/)) {
  const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/)
  if (m && watch.includes(Number(m[1])))
    hits.set(Number(m[1]), m[2])
}
for (const p of watch) {
  console.log(`${p}\t${hits.has(p)
    ? `pid ${hits.get(p)}`
    : '-'}`)
}
