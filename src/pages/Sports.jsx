import { useEffect, useRef, useState } from 'react'
import './Sports.css'

const examples = [
  ['아스널', '토트넘 홋스퍼', '프리미어리그'],
  ['FC 바르셀로나', '레알 마드리드', '라리가'],
  ['바이에른 뮌헨', '보루시아 도르트문트', '분데스리가'],
  ['인터 밀란', 'AC 밀란', '세리에 A'],
  ['FC 서울', '울산 HD', 'K리그 1'],
].map(([away, home, league], index) => ({ id: `soccer-sample-${index}`, away, home, league, sample: true }))

export function Sports() {
  const [games, setGames] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updated, setUpdated] = useState(null)
  const [filter, setFilter] = useState('all')
  const [retry, setRetry] = useState(0)
  const allGames = [...games, ...examples.slice(0, Math.max(0, 5 - games.length))]
  const selected = allGames.find(game => game.id === selectedId) || allGames[0]
  const shown = allGames.filter(game => filter !== 'live' || game.live)

  useEffect(() => {
    const controller = new AbortController()
    const refresh = async () => {
      try {
        const response = await fetch('/api/sports/games', { signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        setGames(data.games)
        setUpdated(data.updatedAt)
        setError('')
      } catch (err) {
        if (err.name !== 'AbortError') setError('경기 정보를 가져오지 못했습니다. 예시 경기방을 이용하거나 다시 시도해 주세요.')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    refresh()
    const timer = setInterval(refresh, 30000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [retry])

  return (
    <main className="sports-page">
      <div className="sports-container">
        <div className="sports-heading"><div><p className="sports-eyebrow">PLAY TOGETHER · SPORTS</p><h1>축구의 모든 순간, 함께.</h1><p>경기를 고르고, 같은 팀을 응원하는 팬들과 이야기를 나눠보세요.</p></div><span className="sports-season">⚽ FOOTBALL LOUNGE</span></div>
        <div className="sports-toolbar"><div className="sports-tabs" aria-label="경기 필터"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>전체 경기 <span>{allGames.length}</span></button><button className={filter === 'live' ? 'active' : ''} onClick={() => setFilter('live')}>진행 중 <span>{games.filter(game => game.live).length}</span></button></div><p>{loading ? '경기 불러오는 중…' : updated ? `${new Date(updated).toLocaleTimeString('ko-KR')} 갱신 · 30초마다 업데이트` : '예시 경기방'} <button onClick={() => setRetry(value => value + 1)} aria-label="경기 정보 새로고침">↻</button></p></div>
        {error && <p className="sports-notice" role="status">{error}</p>}
        <div className="sports-games" aria-label="축구 경기 목록">
          {shown.map(game => <button key={game.id} className={`sports-game ${selected?.id === game.id ? 'selected' : ''}`} onClick={() => setSelectedId(game.id)} aria-pressed={selected?.id === game.id}>
            <div className="game-meta"><span>{game.league}</span><span className={game.live ? 'live-badge' : 'game-status'}>{game.sample ? '예시 경기' : game.live ? '● LIVE' : game.status}</span></div>
            <div className="game-team"><span>{game.home}</span><b>{game.homeScore ?? '–'}</b></div><div className="game-team"><span>{game.away}</span><b>{game.awayScore ?? '–'}</b></div>
            <div className="game-bottom">{game.sample ? '일정·스코어는 실제 정보가 아닙니다' : game.live ? game.status || game.clock || '경기 진행 중' : new Date(game.date).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}<span>{selected?.id === game.id ? '선택됨' : '입장 →'}</span></div>
          </button>)}
          {!shown.length && <p className="sports-empty">현재 진행 중인 경기가 없습니다. 전체 경기에서 경기방을 선택해 주세요.</p>}
        </div>
        {selected && <div className="sports-watch-layout"><section className="sports-watch"><div className="watch-title"><div><span>{selected.league} {selected.sample && '· 예시 경기방'}</span><h2>{selected.home} <em>vs</em> {selected.away}</h2></div><span className="watch-tag">함께 응원하기</span></div><SportsPlayer key={selected.id} game={selected} /></section><SportsChat key={selected.id} game={selected} /></div>}
        <p className="sports-footnote">경기 정보: ESPN 축구 스코어보드 · 예시 경기방은 실제 일정이나 생중계가 아닙니다. 같은 경기방의 접속자끼리 채팅을 공유합니다. 대화는 임시 보관됩니다.</p>
      </div>
    </main>
  )
}

function SportsPlayer({ game }) {
  const [videos, setVideos] = useState([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(!game.sample)
  const [error, setError] = useState('')
  const [playbackError, setPlaybackError] = useState(false)
  const [retry, setRetry] = useState(0)
  const current = videos[index]

  useEffect(() => {
    if (game.sample) return
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/sports/videos?game=${game.id}&league=${encodeURIComponent(game.leagueId)}`, { signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        setVideos(data.videos)
        setIndex(0)
        setPlaybackError(false)
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message || '영상을 불러오지 못했습니다.')
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    load()
    return () => controller.abort()
  }, [game.id, game.leagueId, game.sample, retry])

  return <>
    <div className="sports-player">
      {current && !playbackError ? <video key={current.url} className="sports-video" controls playsInline preload="metadata" aria-label={current.title} onError={() => setPlaybackError(true)} src={current.url}>이 브라우저는 영상 재생을 지원하지 않습니다.</video> : <div className="player-content"><span className="player-icon">▷</span><h3>{loading ? '공식 영상을 불러오는 중…' : playbackError ? '영상을 재생할 수 없습니다' : game.sample ? '실제 축구 경기를 선택해 주세요' : '지금 재생할 수 있는 영상이 없습니다'}</h3><p role="status">{error || (playbackError ? '영상이 만료되었거나 네트워크에서 차단되었을 수 있습니다.' : game.sample ? '예시 경기방에는 실제 경기 영상이 연결되지 않습니다.' : '공식 영상이 제공되면 여기서 재생할 수 있습니다.')}<br />경기별 채팅은 계속 이용할 수 있습니다.</p>{!game.sample && <button className="video-retry" onClick={() => { setPlaybackError(false); setRetry(value => value + 1) }} disabled={loading}>영상 다시 불러오기</button>}<div className="sports-broadcast-links"><a href="https://www.plus.fifa.com/" target="_blank" rel="noopener noreferrer">FIFA+ 공식 중계 확인 ↗</a><a href="https://www.uefa.tv/" target="_blank" rel="noopener noreferrer">UEFA.tv 공식 영상 ↗</a></div></div>}
    </div>
    {current && <div className="sports-video-caption"><span>공식 하이라이트 · 생중계 아님</span><h3>{current.title}</h3></div>}
    {videos.length > 1 && <div className="sports-video-list" aria-label="경기 영상 목록">{videos.map((video, videoIndex) => <button key={video.id} aria-pressed={index === videoIndex} onClick={() => { setIndex(videoIndex); setPlaybackError(false) }}>{videoIndex + 1}. {video.title}</button>)}</div>}
    <div className="watch-info"><p><span className="green-dot" /> 영상을 보면서 응원 채팅에 참여하세요</p><p>ESPN 축구 하이라이트 제공 · 생중계 영상은 미연결</p></div>
  </>
}

function SportsChat({ game }) {
  const [messages, setMessages] = useState([])
  const [viewers, setViewers] = useState(0)
  const [session, setSession] = useState('')
  const [connected, setConnected] = useState(false)
  const [name, setName] = useState(() => { try { return sessionStorage.getItem('sports-nickname') || '' } catch { return '' } })
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const bottom = useRef(null)
  useEffect(() => {
    let events
    let disposed = false
    const controller = new AbortController()
    const connect = async () => {
      try {
        const response = await fetch('/api/sports/chat-status', { signal: controller.signal })
        if (!response.ok || !(await response.json()).available) throw new Error('공유 채팅 서버 설정이 필요합니다. 잠시 후 다시 방문해 주세요.')
        if (disposed) return
        events = new EventSource(`/api/sports/events?room=${game.id}`)
        events.addEventListener('session', event => { setSession(JSON.parse(event.data).id); setConnected(true); setError('') })
        events.onmessage = event => {
          const data = JSON.parse(event.data)
          setMessages(previous => previous.length === data.messages.length && previous.at(-1)?.id === data.messages.at(-1)?.id ? previous : data.messages)
          setViewers(data.viewers)
        }
        events.onerror = () => { setConnected(false); setSession(''); setError('채팅에 다시 연결하고 있습니다. 연결이 계속 안 되면 잠시 후 다시 방문해 주세요.') }
      } catch (err) { if (!disposed) setError(err.message || '채팅 연결에 실패했습니다.') }
    }
    connect()
    return () => { disposed = true; controller.abort(); events?.close() }
  }, [game.id])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }) }, [messages])
  const send = async event => {
    event.preventDefault()
    if (!text.trim() || !name.trim() || !connected || sending) return
    setSending(true); setError('')
    try {
      const response = await fetch(`/api/sports/messages?room=${game.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session, name: name.trim(), text: text.trim() }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setText('')
      try { sessionStorage.setItem('sports-nickname', name.trim()) } catch { /* Storage may be unavailable. */ }
    } catch (err) { setError(err.message || '메시지를 보내지 못했습니다.') } finally { setSending(false) }
  }
  return <aside className="sports-chat" aria-label="경기 응원 채팅"><div className="chat-heading"><h2>응원 채팅 <span className="green-dot" /></h2><span>{connected ? `${viewers}명 접속` : '재연결 중…'}</span></div><p className="chat-room-label">{game.home} vs {game.away}</p><div className="chat-messages" role="log" aria-live="polite" aria-relevant="additions"><p className="chat-welcome">⚽ 함께하면 더 즐거운 축구!<br />닉네임을 입력하고 첫 응원을 남겨보세요.<br />서로를 존중하며 대화해 주세요.</p>{messages.map(message => <div className="chat-message" key={message.id}><div><strong>{message.name}</strong><time>{new Date(message.time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</time></div><p>{message.text}</p></div>)}<div ref={bottom} /></div><form className="chat-form" onSubmit={send}><label htmlFor="sports-name">닉네임</label><input id="sports-name" value={name} onChange={event => setName(event.target.value)} maxLength={16} placeholder="응원 닉네임을 입력하세요" required /><label className="visually-hidden" htmlFor="sports-message">채팅 메시지</label><textarea id="sports-message" value={text} onChange={event => setText(event.target.value)} maxLength={300} placeholder={connected ? '응원의 한마디를 남겨주세요' : '채팅 서버에 연결 중입니다'} required /><div className="chat-send"><span>{text.length}/300</span><button type="submit" disabled={!connected || !name.trim() || !text.trim() || sending}>{sending ? '전송 중…' : '보내기 ↑'}</button></div>{error && <p className="chat-error" role="alert">{error}</p>}</form></aside>
}
