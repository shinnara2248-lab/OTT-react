import { attachSports } from '../server/sports.js'
import { handleSharedChat } from '../server/redis-chat.js'

let sports
attachSports({ middlewares: { use(handler) { sports = handler } } })

export default async function handler(req, res) {
  const url = new URL(req.url, 'https://localhost')
  const operation = url.searchParams.get('operation')
  if (!['games', 'videos', 'chat-status', 'events', 'messages'].includes(operation)) { res.statusCode = 404; res.end(); return }
  if (req.headers.origin) {
    try { if (new URL(req.headers.origin).host !== req.headers.host) { res.statusCode = 403; res.end(); return } }
    catch { res.statusCode = 403; res.end(); return }
  }
  if (['chat-status', 'events', 'messages'].includes(operation)) return handleSharedChat(req, res, operation, url)
  url.pathname = `/api/sports/${operation}`
  url.searchParams.delete('operation')
  req.url = url.pathname + url.search
  return sports(req, res, () => { res.statusCode = 404; res.end() })
}
