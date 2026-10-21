import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import process from 'node:process'
import handler from '../api/sports.js'

const nativeFetch = globalThis.fetch
const strings = new Map(), lists = new Map(), sorted = new Map()
const store = (key, value, ttl = Infinity) => strings.set(key, { value, until: Date.now() + ttl })
const get = key => { const item = strings.get(key); return item?.until > Date.now() ? item.value : null }
globalThis.fetch = (url, options) => {
  if (String(url) !== 'https://redis.invalid/pipeline') return nativeFetch(url, options)
  const results = JSON.parse(options.body).map(([command, key, ...args]) => {
    switch (command) {
      case 'SET': {
        if (args.includes('NX') && get(key)) return { result: null }
        const ttl = args.includes('PX') ? Number(args[args.indexOf('PX') + 1]) : Infinity
        store(key, args[0], ttl); return { result: 'OK' }
      }
      case 'GET': return { result: get(key) }
      case 'DEL': strings.delete(key); return { result: 1 }
      case 'ZADD': { const set = sorted.get(key) || new Map(); set.set(args[1], Number(args[0])); sorted.set(key, set); return { result: 1 } }
      case 'ZREMRANGEBYSCORE': { const set = sorted.get(key); for (const [id, score] of set || []) if (score <= Number(args[1])) set.delete(id); return { result: 0 } }
      case 'ZREM': sorted.get(key)?.delete(args[0]); return { result: 1 }
      case 'ZCARD': return { result: sorted.get(key)?.size || 0 }
      case 'LPUSH': { const list = lists.get(key) || []; list.unshift(args[0]); lists.set(key, list); return { result: list.length } }
      case 'LTRIM': lists.set(key, (lists.get(key) || []).slice(Number(args[0]), Number(args[1]) + 1)); return { result: 'OK' }
      case 'LRANGE': return { result: (lists.get(key) || []).slice(Number(args[0]), Number(args[1]) + 1) }
      case 'EXPIRE': return { result: 1 }
      default: throw Error(`Unexpected Redis command ${command}`)
    }
  })
  return Promise.resolve(Response.json(results))
}
const server = createServer((req, res) => { handler(req, res).catch(() => { res.statusCode = 500; res.end() }) })
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}/api/sports?operation=`
after(() => { globalThis.fetch = nativeFetch; server.closeAllConnections(); server.close() })

async function connect(room) {
  const controller = new AbortController()
  const response = await fetch(`${base}events&room=${room}`, { signal: controller.signal })
  assert.equal(response.status, 200)
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
  async function next() {
    while (!buffer.includes('\n\n')) { const { value, done } = await reader.read(); if (done) throw Error('stream closed'); buffer += decoder.decode(value, { stream: true }) }
    const index = buffer.indexOf('\n\n'); const event = buffer.slice(0, index); buffer = buffer.slice(index + 2)
    return JSON.parse(event.split('\n').find(line => line.startsWith('data: ')).slice(6))
  }
  return { session: (await next()).id, next, close: () => controller.abort() }
}
const post = (room, body) => fetch(`${base}messages&room=${room}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

test('Vercel returns a clear unavailable state without shared storage', async () => {
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN
  delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN
  assert.deepEqual(await (await fetch(base + 'chat-status')).json(), { available: false })
  assert.equal((await fetch(base + 'events&room=soccer-one')).status, 503)
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'local-test-only'
  assert.deepEqual(await (await fetch(base + 'chat-status')).json(), { available: true })
})

test('Vercel chat shares storage, scopes sessions to rooms and applies rate limits', { timeout: 12000 }, async () => {
  const a = await connect('soccer-one'); const b = await connect('soccer-one'); const other = await connect('soccer-other')
  try {
    const initial = await a.next(); assert.ok(initial.viewers >= 1)
    assert.equal((await other.next()).messages.length, 0)
    assert.equal((await post('soccer-one', { session: a.session, name: '팬', text: ' ' })).status, 400)
    assert.equal((await post('soccer-other', { session: a.session, name: '팬', text: 'wrong room' })).status, 403)
    assert.equal((await post('soccer-one', { session: a.session, name: '팬', text: '골! <script>' })).status, 201)
    assert.equal((await post('soccer-one', { session: a.session, name: '팬', text: 'too fast' })).status, 429)
    let shared
    do { shared = await b.next() } while (!shared.messages.length)
    assert.equal(shared.messages[0].text, '골! <script>')
    assert.equal(shared.viewers, 2)
    assert.equal((await other.next()).messages.length, 0)
  } finally { a.close(); b.close(); other.close() }
})

test('Vercel rejects cross-origin requests and unknown operations', async () => {
  assert.equal((await fetch(base + 'chat-status', { headers: { Origin: 'https://untrusted.invalid' } })).status, 403)
  assert.equal((await fetch(base + 'unknown')).status, 404)
})
