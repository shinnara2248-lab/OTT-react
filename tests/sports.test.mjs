import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ server: { host: '127.0.0.1', port: 0 } })
await server.listen()
const base = `http://127.0.0.1:${server.httpServer.address().port}`
after(() => server.close())

async function connect(room) {
  const controller = new AbortController()
  const res = await fetch(`${base}/api/sports/events?room=${room}`, { signal: controller.signal })
  assert.equal(res.status, 200)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  async function next() {
    while (!buffer.includes('\n\n')) {
      const { value, done } = await reader.read()
      if (done) throw Error('Unexpected stream close')
      buffer += decoder.decode(value, { stream: true })
    }
    const end = buffer.indexOf('\n\n')
    const block = buffer.slice(0, end)
    buffer = buffer.slice(end + 2)
    const line = block.split('\n').find(line => line.startsWith('data: '))
    return line ? JSON.parse(line.slice(6)) : next()
  }
  const session = (await next()).id
  return { session, next, close: () => controller.abort() }
}
const post = (room, body) => fetch(`${base}/api/sports/messages?room=${room}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

test('two clients share messages and presence; other rooms are isolated', { timeout: 10000 }, async () => {
  const a = await connect('test-game')
  const b = await connect('test-game')
  const other = await connect('other-game')
  try {
    assert.equal((await a.next()).viewers, 1)
    assert.equal((await a.next()).viewers, 2)
    assert.equal((await b.next()).viewers, 2)
    assert.deepEqual((await other.next()).messages, [])
    const sent = await post('test-game', { session: a.session, name: '축구팬', text: '함께 응원해요! <script>' })
    assert.equal(sent.status, 201)
    for (const client of [a, b]) {
      const state = await client.next()
      assert.equal(state.messages.at(-1).text, '함께 응원해요! <script>')
      assert.equal(state.messages.at(-1).name, '축구팬')
    }
    assert.equal((await post('other-game', { session: a.session, name: '팬', text: 'room leak' })).status, 403)
    b.close()
    assert.equal((await a.next()).viewers, 1)
  } finally { a.close(); b.close(); other.close() }
})

test('invalid rooms and disconnected senders are rejected', async () => {
  assert.equal((await fetch(`${base}/api/sports/events?room=bad!`)).status, 400)
  assert.equal((await post('test-reject', { session: 'fake', name: '팬', text: 'hello' })).status, 403)
})

test('message validation and rate limit', { timeout: 10000 }, async () => {
  const client = await connect('test-limits')
  try {
    const send = text => post('test-limits', { session: client.session, name: '팬', text })
    assert.equal((await send(' ')).status, 400)
    assert.equal((await send('x'.repeat(301))).status, 400)
    assert.equal((await send('정상 메시지')).status, 201)
    assert.equal((await send('연속 메시지')).status, 429)
  } finally { client.close() }
})

test('sports route and source are served', async () => {
  const page = await fetch(`${base}/sports`)
  assert.equal(page.status, 200)
  assert.match(await page.text(), /id="root"/)
  const source = await fetch(`${base}/src/pages/Sports.jsx`)
  assert.equal(source.status, 200)
  assert.match(await source.text(), /plus\.fifa\.com/)
})


test('football schedule maps home/away, live clock, upcoming scores and draws', async () => {
  const original = globalThis.fetch
  const fixture = (id, state, homeScore, awayScore) => ({
    id, date: '2026-10-21T12:00:00Z', competitions: [{
      competitors: [
        { homeAway: 'away', team: { displayName: 'Away FC' }, score: awayScore },
        { homeAway: 'home', team: { displayName: 'Home FC' }, score: homeScore },
      ], status: { type: { state, shortDetail: state === 'in' ? "67'" : state === 'post' ? 'FT' : 'Scheduled' }, displayClock: "67'" },
    }],
  })
  globalThis.fetch = (url, options) => String(url).startsWith('https://site.api.espn.com/')
    ? Promise.resolve(Response.json({ events: [fixture('10', 'pre', '0', '0'), fixture('11', 'in', '2', '1'), fixture('12', 'post', '1', '1')] }))
    : original(url, options)
  try {
    const response = await fetch(`${base}/api/sports/games`)
    assert.equal(response.status, 200)
    const { games, updatedAt } = await response.json()
    assert.equal(games.length, 3, 'duplicate event IDs across feeds are deduplicated')
    assert.equal(games[0].id, 'soccer-11')
    assert.equal(games[0].live, true)
    assert.equal(games[0].home, 'Home FC')
    assert.equal(games[0].away, 'Away FC')
    assert.equal(games[0].homeScore, '2')
    assert.equal(games[0].clock, "67'")
    assert.equal(games.find(game => game.id === 'soccer-10').homeScore, null)
    const draw = games.find(game => game.id === 'soccer-12')
    assert.equal(draw.live, false)
    assert.equal(draw.status, 'FT')
    assert.equal(draw.homeScore, draw.awayScore)
    assert.ok(updatedAt > 0)
  } finally { globalThis.fetch = original }
})

test('football video API selects ESPN HTTPS MP4 and rejects unsupported games/leagues', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (url, options) => String(url).startsWith('https://site.api.espn.com/')
    ? Promise.resolve(Response.json({ videos: [
      { id: 1, headline: '결승골 하이라이트', links: { source: { href: 'https://media.video-cdn.espn.com/goal.mp4' } } },
      { id: 2, links: { source: { href: 'https://espn.com.evil.example/goal.mp4' } } },
      { id: 3, links: { source: { href: 'http://media.video-cdn.espn.com/goal.mp4' } } },
      { id: 4, links: { source: { href: 'javascript:alert(1)' } } },
    ] })) : original(url, options)
  try {
    assert.equal((await fetch(`${base}/api/sports/videos?game=soccer-sample-0&league=eng.1`)).status, 400)
    assert.equal((await fetch(`${base}/api/sports/videos?game=soccer-11&league=../../evil`)).status, 400)
    assert.equal((await fetch(`${base}/api/sports/videos?game=11&league=eng.1`)).status, 400)
    const response = await fetch(`${base}/api/sports/videos?game=soccer-11&league=eng.1`)
    assert.equal(response.status, 200)
    const { videos } = await response.json()
    assert.equal(videos.length, 1)
    assert.equal(videos[0].url, 'https://media.video-cdn.espn.com/goal.mp4')
    assert.equal(videos[0].type, 'highlight')
    assert.equal(videos[0].title, '결승골 하이라이트')
  } finally { globalThis.fetch = original }
})

test('unpublished football video returns empty list; provider failure returns 503', async () => {
  const original = globalThis.fetch
  let fail = false
  globalThis.fetch = (url, options) => String(url).startsWith('https://site.api.espn.com/')
    ? (fail ? Promise.reject(new Error('blocked')) : Promise.resolve(Response.json({})))
    : original(url, options)
  try {
    const response = await fetch(`${base}/api/sports/videos?game=soccer-12&league=eng.1`)
    assert.deepEqual((await response.json()).videos, [])
    fail = true
    assert.equal((await fetch(`${base}/api/sports/videos?game=soccer-12&league=eng.1`)).status, 503)
  } finally { globalThis.fetch = original }
})
