import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { Buffer } from 'node:buffer'

export function chatConfigured() {
  return Boolean((process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) && (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN))
}

async function commands(batch) {
  const endpoint = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/pipeline`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(batch), signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error('shared chat unavailable')
  const data = await response.json()
  if (!Array.isArray(data) || data.some(item => item.error)) throw new Error('shared chat command failed')
  return data.map(item => item.result)
}

export async function handleSharedChat(req, res, operation, url) {
  const json = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(data))
  }
  if (operation === 'chat-status') return json(200, { available: chatConfigured() })
  if (!chatConfigured()) return json(503, { error: '공유 채팅 서버 설정이 필요합니다. 잠시 후 다시 방문해 주세요.' })
  const roomId = url.searchParams.get('room')
  if (!/^soccer-[a-zA-Z0-9-]{1,56}$/.test(roomId || '')) return json(400, { error: '올바른 축구 경기방이 아닙니다.' })
  const prefix = `sports:${roomId}`
  const presence = `${prefix}:presence`
  const messages = `${prefix}:messages`
  try {
    if (operation === 'messages' && req.method === 'POST') {
      let body = req.body
      if (!body) {
        const chunks = []; let bytes = 0
        for await (const chunk of req) {
          bytes += chunk.length
          if (bytes > 4096) return json(413, { error: '메시지가 너무 깁니다.' })
          chunks.push(chunk)
        }
        try { body = JSON.parse(Buffer.concat(chunks).toString()) } catch { return json(400, { error: '잘못된 메시지 형식입니다.' }) }
      }
      if (typeof body === 'string') { try { body = JSON.parse(body) } catch { return json(400, { error: '잘못된 메시지 형식입니다.' }) } }
      if (!body || Buffer.byteLength(JSON.stringify(body)) > 4096) return json(413, { error: '메시지가 너무 깁니다.' })
      if (!/^[0-9a-f-]{36}$/.test(body.session || '')) return json(403, { error: '채팅에 다시 연결해 주세요.' })
      const [session] = await commands([['GET', `${prefix}:session:${body.session}`]])
      if (!session) return json(403, { error: '채팅에 다시 연결해 주세요.' })
      const name = String(body.name || '').trim().slice(0, 16)
      const text = String(body.text || '').trim()
      if (!name || !text || text.length > 300) return json(400, { error: '닉네임과 300자 이하 메시지를 입력해 주세요.' })
      const [allowed] = await commands([['SET', `${prefix}:rate:${body.session}`, '1', 'PX', 1000, 'NX']])
      if (!allowed) return json(429, { error: '메시지는 1초에 한 번 보낼 수 있습니다.' })
      const message = { id: randomUUID(), name, text, time: Date.now() }
      await commands([['LPUSH', messages, JSON.stringify(message)], ['LTRIM', messages, 0, 99], ['EXPIRE', messages, 86400]])
      return json(201, { ok: true })
    }
    if (operation !== 'events' || req.method !== 'GET') return json(405, { error: '지원하지 않는 요청입니다.' })
    const id = randomUUID()
    const sessionKey = `${prefix}:session:${id}`
    // Establish storage connectivity before sending streaming headers.
    await commands([['SET', sessionKey, '1', 'PX', 15000]])
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    res.flushHeaders?.()
    res.write(`event: session\ndata: ${JSON.stringify({ id })}\n\n`)
    const controller = new AbortController()
    const close = () => controller.abort()
    res.once('close', close)
    const deadline = Date.now() + 50000
    try {
      while (!controller.signal.aborted && Date.now() < deadline) {
        const now = Date.now()
        const results = await commands([
          ['SET', sessionKey, '1', 'PX', 15000], ['ZADD', presence, now + 15000, id],
          ['ZREMRANGEBYSCORE', presence, '-inf', now], ['EXPIRE', presence, 60],
          ['ZCARD', presence], ['LRANGE', messages, 0, 99],
        ])
        if (controller.signal.aborted) break
        const state = { viewers: results[4], messages: (results[5] || []).map(item => JSON.parse(item)).reverse() }
        res.write(`data: ${JSON.stringify(state)}\n\n`)
        await delay(2000, undefined, { signal: controller.signal })
      }
    } finally {
      res.removeListener('close', close)
      res.end()
      await commands([['DEL', sessionKey], ['ZREM', presence, id]]).catch(() => {})
    }
  } catch {
    if (!res.headersSent) return json(503, { error: '공유 채팅 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' })
    res.end()
  }
}
