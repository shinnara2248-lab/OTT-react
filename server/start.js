import { createServer } from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { attachSports } from './sports.js'

const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)))
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2' }
if (!existsSync(resolve(root, 'index.html'))) throw new Error('Missing dist/index.html. Run npm run build before npm start.')
let sports
const server = createServer((req, res) => {
  Promise.resolve(sports(req, res, () => serve(req, res))).catch(() => {
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('서버 오류가 발생했습니다.')
  })
})
attachSports({ httpServer: server, middlewares: { use(handler) { sports = handler } } })

async function serve(req, res) {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return }
  let pathname
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname) } catch { res.writeHead(400); res.end(); return }
  if (pathname.split('/').some(segment => segment.startsWith('.'))) { res.writeHead(404); res.end(); return }
  if (pathname.startsWith('/api/')) { res.writeHead(404); res.end(); return }
  let file = resolve(root, `.${pathname}`)
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); res.end(); return }
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file')
  } catch {
    if (extname(pathname)) { res.writeHead(404); res.end(); return }
    file = resolve(root, 'index.html')
  }
  res.writeHead(200, {
    'Content-Type': types[extname(file)] || 'application/octet-stream',
    'Cache-Control': file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  })
  if (req.method === 'HEAD') { res.end(); return }
  createReadStream(file).on('error', () => res.destroy()).pipe(res)
}
const port = Number(process.env.PORT || 3000)
server.listen(port, '0.0.0.0', () => console.log(`Production server listening on port ${server.address().port}`))
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { server.close(); setTimeout(() => process.exit(0), 3000).unref() })
}
