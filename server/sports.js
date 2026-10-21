/* global Buffer */
import { randomUUID } from 'node:crypto'

const footballLeagues = {
  'eng.1': '프리미어리그', 'esp.1': '라리가', 'ger.1': '분데스리가',
  'ita.1': '세리에 A', 'uefa.champions': '챔피언스리그', 'kor.1': 'K리그 1',
}
const footballApi = 'https://site.api.espn.com/apis/site/v2/sports/soccer'

export function sportsPlugin() {
  return {
    name: 'sports-live-service',
    configureServer: attachSports,
    configurePreviewServer: attachSports,
  }
}

export function attachSports(server) {
  const rooms = new Map()
  let schedule = null
  let refreshed = 0
  let pending
  const getRoom = (id) => {
    if (!rooms.has(id)) rooms.set(id, { clients: new Map(), messages: [] })
    return rooms.get(id)
  }
  const emit = (room) => {
    const payload = `data: ${JSON.stringify({ viewers: room.clients.size, messages: room.messages })}\n\n`
    for (const res of room.clients.values()) res.write(payload)
  }
  const timer = setInterval(() => {
    for (const [id, room] of rooms) {
      for (const res of room.clients.values()) res.write(': heartbeat\n\n')
      if (!room.clients.size) rooms.delete(id)
    }
  }, 25000)
  timer.unref()
  server.httpServer?.once('close', () => {
    clearInterval(timer)
    for (const room of rooms.values()) for (const res of room.clients.values()) res.end()
  })
  server.middlewares.use(async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost')
    if (!url.pathname.startsWith('/api/sports/')) return next()
    const json = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(data))
    }
    if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return json(403, { error: '허용되지 않은 요청입니다.' })
    if (url.pathname === '/api/sports/chat-status' && req.method === 'GET') return json(200, { available: true })
    if (url.pathname === '/api/sports/games' && req.method === 'GET') {
      try {
        if (!schedule || Date.now() - refreshed > 20000) {
          pending ||= (async () => {
            const start = new Date(); start.setUTCDate(start.getUTCDate() - 1)
            const end = new Date(); end.setUTCDate(end.getUTCDate() + 2)
            const compactDate = date => date.toISOString().slice(0, 10).replaceAll('-', '')
            const results = await Promise.allSettled(Object.entries(footballLeagues).map(async ([leagueId, league]) => {
              const upstream = await fetch(`${footballApi}/${leagueId}/scoreboard?dates=${compactDate(start)}-${compactDate(end)}&limit=100`, { signal: AbortSignal.timeout(8000) })
              if (!upstream.ok) throw new Error('schedule unavailable')
              const data = await upstream.json()
              if (!Array.isArray(data.events)) throw new Error('invalid schedule')
              return data.events.flatMap(event => {
                const competition = event.competitions?.[0]
                const home = competition?.competitors?.find(team => team.homeAway === 'home')
                const away = competition?.competitors?.find(team => team.homeAway === 'away')
                const status = competition?.status || event.status
                if (!home || !away || !status?.type || !/^\d+$/.test(event.id)) return []
                const started = status.type.state !== 'pre'
                return [{
                  id: `soccer-${event.id}`, home: home.team.displayName, away: away.team.displayName,
                  homeScore: started ? home.score ?? null : null, awayScore: started ? away.score ?? null : null,
                  live: status.type.state === 'in', status: status.type.shortDetail || status.type.description,
                  clock: status.displayClock || '', date: event.date, league, leagueId,
                }]
              })
            }))
            if (results.every(result => result.status === 'rejected')) throw new Error('football feeds unavailable')
            schedule = [...new Map(results.flatMap(result => result.status === 'fulfilled' ? result.value : []).map(game => [game.id, game])).values()]
              .sort((a, b) => Number(b.live) - Number(a.live) || a.date.localeCompare(b.date))
            refreshed = Date.now()
          })().finally(() => { pending = null })
          await pending
        }
        return json(200, { games: schedule, updatedAt: refreshed })
      } catch { return json(503, { error: '실시간 경기 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' }) }
    }
    if (url.pathname === '/api/sports/videos' && req.method === 'GET') {
      const gameId = url.searchParams.get('game')
      const leagueId = url.searchParams.get('league')
      if (!/^soccer-\d{1,12}$/.test(gameId || '') || !Object.hasOwn(footballLeagues, leagueId || '')) return json(400, { error: '실제 축구 경기를 선택해 주세요.' })
      try {
        const upstream = await fetch(`${footballApi}/${leagueId}/summary?event=${gameId.slice(7)}`, { signal: AbortSignal.timeout(8000) })
        if (!upstream.ok) throw new Error('video unavailable')
        const content = await upstream.json()
        const videos = (content.videos || []).flatMap(item => {
          const source = item.links?.source?.href
          try {
            const media = new URL(source)
            const official = ['espn.com', 'espncdn.com'].some(host => media.hostname.endsWith(`.${host}`))
            if (media.protocol !== 'https:' || !official || !media.pathname.endsWith('.mp4')) return []
            return [{ id: String(item.id || source), title: item.headline || '축구 경기 하이라이트', url: source, type: 'highlight' }]
          } catch { return [] }
        }).slice(0, 20)
        return json(200, { videos })
      } catch { return json(503, { error: '축구 영상 서버에 연결할 수 없습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.' }) }
    }
    const roomId = url.searchParams.get('room')
    if (!/^[a-zA-Z0-9-]{1,64}$/.test(roomId || '')) return json(400, { error: '올바른 경기방이 아닙니다.' })
    if (!rooms.has(roomId) && rooms.size >= 100) return json(503, { error: '채팅방이 가득 찼습니다.' })
    const room = getRoom(roomId)
    if (url.pathname === '/api/sports/events' && req.method === 'GET') {
      if (room.clients.size >= 100) return json(503, { error: '접속자가 많습니다. 잠시 후 다시 접속해 주세요.' })
      const id = randomUUID()
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
      res.write(`event: session\ndata: ${JSON.stringify({ id })}\n\n`)
      room.clients.set(id, res)
      emit(room)
      req.on('close', () => { room.clients.delete(id); emit(room) })
      return
    }
    if (url.pathname === '/api/sports/messages' && req.method === 'POST') {
      let bytes = 0
      const chunks = []
      try {
        for await (const chunk of req) {
          bytes += chunk.length
          if (bytes > 4096) return json(413, { error: '메시지가 너무 깁니다.' })
          chunks.push(chunk)
        }
        const body = JSON.parse(Buffer.concat(chunks).toString())
        const client = room.clients.get(body.session)
        if (!client) return json(403, { error: '채팅에 다시 연결해 주세요.' })
        if (Date.now() - (client.lastMessage || 0) < 1000) return json(429, { error: '메시지는 1초에 한 번 보낼 수 있습니다.' })
        const name = String(body.name || '').trim().slice(0, 16)
        const text = String(body.text || '').trim()
        if (!name || !text || text.length > 300) return json(400, { error: '닉네임과 300자 이하 메시지를 입력해 주세요.' })
        client.lastMessage = Date.now()
        room.messages.push({ id: randomUUID(), name, text, time: Date.now() })
        room.messages = room.messages.slice(-100)
        emit(room)
        return json(201, { ok: true })
      } catch { return json(400, { error: '메시지 형식을 확인해 주세요.' }) }
    }
    return json(404, { error: '지원하지 않는 요청입니다.' })
  })
}
