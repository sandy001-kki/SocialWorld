import { useEffect, useRef, useState, useCallback } from 'react'
import World from './World.js'
import { fetchBuildings, authenticateFacebook, buildFacebookOAuthUrl, fetchAd } from './api.js'
import FlightHints from './components/FlightHints.jsx'
import SearchBar from './components/SearchBar.jsx'
import SidePanel from './components/SidePanel.jsx'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getStoredAuth() {
  try {
    const token = localStorage.getItem('sw_token')
    const user  = JSON.parse(localStorage.getItem('sw_user') || 'null')
    return token && user ? { token, user } : null
  } catch { return null }
}
function saveAuth(token, user) {
  localStorage.setItem('sw_token', token)
  localStorage.setItem('sw_user', JSON.stringify(user))
}
function clearAuth() {
  localStorage.removeItem('sw_token')
  localStorage.removeItem('sw_user')
}

// ---------------------------------------------------------------------------
// Snow canvas (landing page particle effect)
// ---------------------------------------------------------------------------
function Snow() {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx    = canvas.getContext('2d')
    let w = canvas.width  = window.innerWidth
    let h = canvas.height = window.innerHeight
    let raf

    const flakes = Array.from({ length: 180 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 2.5 + 0.5,
      speed: Math.random() * 0.8 + 0.3,
      drift: (Math.random() - 0.5) * 0.4,
      opacity: Math.random() * 0.55 + 0.15,
      twinkle: Math.random() * Math.PI * 2,
    }))

    let angle = 0
    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      angle += 0.004
      flakes.forEach(f => {
        f.twinkle += 0.04
        const alpha = f.opacity + Math.sin(f.twinkle) * 0.1
        ctx.beginPath()
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, alpha)})`
        ctx.shadowBlur = f.r * 3
        ctx.shadowColor = 'rgba(200,220,255,0.6)'
        ctx.fill()
        f.y += f.speed
        f.x += Math.sin(angle + f.drift) * 0.5
        if (f.y > h + 5) { f.y = -5; f.x = Math.random() * w }
        if (f.x > w + 5) f.x = -5
        if (f.x < -5)    f.x = w + 5
      })
      raf = requestAnimationFrame(draw)
    }
    draw()

    const onResize = () => {
      w = canvas.width  = window.innerWidth
      h = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize) }
  }, [])

  return (
    <canvas ref={ref} style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
    }} />
  )
}

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------
function Landing({ onGuest }) {
  return (
    <div className="landing">
      <Snow />
      {/* Animated city silhouette */}
      <div className="landing__city" aria-hidden="true" />
      <div className="landing__content">
        <div className="landing__badge">✈ 3D Social City</div>
        <h1 className="landing__logo">SocialWorld</h1>
        <p className="landing__tagline">
          A living 3D city where every person is a building.<br />
          The more social you are, the taller you stand.
        </p>
        <a className="btn-facebook" href={buildFacebookOAuthUrl()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
          </svg>
          Explore with Facebook
        </a>
        <br />
        <button className="btn-guest" onClick={onGuest}>
          Continue as guest →
        </button>
        <p className="landing__hint">Fly a plane · Explore buildings · Click to view profiles</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading screen
// ---------------------------------------------------------------------------
function LoadingScreen({ message }) {
  return (
    <div className="loading-overlay">
      <div className="loading-city">
        {[40, 70, 55, 90, 45, 65, 80, 50].map((h, i) => (
          <div key={i} className="loading-building" style={{
            height: h, animationDelay: `${i * 0.12}s`,
          }} />
        ))}
      </div>
      <div className="loading-plane">✈</div>
      <div className="spinner" />
      <p>{message || 'Building your city…'}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Offline page
// ---------------------------------------------------------------------------
function OfflinePage() {
  return (
    <div className="offline-page">
      <div className="offline-icon">📡</div>
      <h2>You're Offline</h2>
      <p>SocialWorld needs an internet connection.<br />Check your connection and try again.</p>
      <button className="btn-facebook" onClick={() => window.location.reload()} style={{ marginTop: '1.5rem' }}>
        Retry Connection
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------
export default function App() {
  const canvasRef = useRef(null)
  const labelRef  = useRef(null)
  const worldRef  = useRef(null)

  const [phase, setPhase]           = useState('landing')
  const [session, setSession]       = useState(getStoredAuth)
  const [buildings, setBuildings]   = useState([])
  const [worldReady, setWorldReady] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [error, setError]           = useState(null)
  const [loadMsg, setLoadMsg]       = useState('Building your city…')
  const [isOffline, setIsOffline]   = useState(!navigator.onLine)
  const [driveMode, setDriveMode]   = useState(false)
  const [adData, setAdData] = useState({ type: 'text', message: 'For ads Contact bollavaramsandeep@gmail.com', media_url: null })

  // ── Offline detection ──────────────────────────────────────────────────
  useEffect(() => {
    const goOffline = () => setIsOffline(true)
    const goOnline  = () => { setIsOffline(false); window.location.reload() }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online',  goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online',  goOnline)
    }
  }, [])

  // ── OAuth callback ────────────────────────────────────────────────────
  useEffect(() => {
    const url     = new URL(window.location.href)
    const code    = url.searchParams.get('code')
    const authErr = url.searchParams.get('auth_error')
    if (authErr) { setError(`Login failed: ${authErr}`); window.history.replaceState({}, '', '/'); return }
    if (code) { window.history.replaceState({}, '', '/'); handleFacebookCode(code) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Skip landing if already logged in
  useEffect(() => {
    if (session) enterWorld()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Auth ──────────────────────────────────────────────────────────────
  async function handleFacebookCode(code) {
    setPhase('loading'); setLoadMsg('Logging in with Facebook…')
    try {
      const { token, user } = await authenticateFacebook(code)
      saveAuth(token, user)
      setSession({ token, user })
      await enterWorld()
    } catch (err) {
      setError(`Login failed: ${err.message}`)
      setPhase('landing')
    }
  }

  // ── Enter world ───────────────────────────────────────────────────────
  async function enterWorld() {
    setPhase('loading'); setLoadMsg('Loading buildings…')
    try {
      const [{ buildings: bldgs }, ad] = await Promise.all([fetchBuildings(), fetchAd()])
      setAdData(ad)
      setBuildings(bldgs)
      setLoadMsg('Rendering city…')
      setPhase('world')
    } catch (err) {
      setError('Could not load world. Is the server running?')
      setPhase('world')
    }
  }

  // ── Init Three.js ─────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'world') return
    if (!canvasRef.current || !labelRef.current || worldRef.current) return
    const world = new World(canvasRef.current, labelRef.current, {
      onBuildingClick: (user) => setSelectedUser(user),
      onReady: () => setWorldReady(true),
      onModeChange: (m) => setDriveMode(m === 'car'),
      adData,
    })
    world.init()
    worldRef.current = world
    return () => { world.dispose(); worldRef.current = null }
  }, [phase])

  useEffect(() => {
    if (!worldReady || !worldRef.current || buildings.length === 0) return
    worldRef.current.loadBuildings(buildings)
  }, [worldReady, buildings])

  // ── Search ────────────────────────────────────────────────────────────
  const handleSearch = useCallback((username) => {
    if (!worldRef.current) return
    const found = worldRef.current.flyToBuilding(username)
    if (!found) setError(`"${username}" not found in the world`)
  }, [])

  // ── Error auto-dismiss ─────────────────────────────────────────────────
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 4000)
    return () => clearTimeout(t)
  }, [error])

  // ── Logout ────────────────────────────────────────────────────────────
  function logout() {
    clearAuth(); setSession(null)
    if (worldRef.current) { worldRef.current.dispose(); worldRef.current = null }
    setWorldReady(false); setBuildings([]); setPhase('landing'); setSelectedUser(null)
  }

  // ── Render ────────────────────────────────────────────────────────────
  if (isOffline) return <OfflinePage />

  return (
    <>
      <canvas id="world-canvas" ref={canvasRef} style={{ display: phase === 'world' ? 'block' : 'none' }} />
      <div id="label-canvas" ref={labelRef}    style={{ display: phase === 'world' ? 'block' : 'none' }} />

      {phase === 'landing' && <Landing onGuest={enterWorld} />}
      {phase === 'loading' && <LoadingScreen message={loadMsg} />}

      {phase === 'world' && (
        <div id="ui-overlay">
          <FlightHints driveMode={driveMode} />
          {!driveMode && <SearchBar onSearch={handleSearch} />}

          {/* Mode toggle button */}
          <button
            onClick={() => {
              if (!worldRef.current) return
              if (driveMode) { worldRef.current.exitCarMode() }
              else           { worldRef.current.enterCarMode() }
            }}
            style={{
              position: 'fixed', bottom: 20, right: 16,
              background: driveMode ? '#ff6600' : '#22aa55',
              color: '#fff', border: 'none', borderRadius: 24,
              padding: '10px 20px', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              transition: 'background 0.2s',
            }}
          >
            {driveMode ? '✈ Fly Plane' : '🚗 Drive Car'}
          </button>

          {session ? (
            <div className="user-badge" onClick={logout} title="Click to sign out">
              <img src={session.user.profile_picture_url || ''} alt={session.user.username}
                onError={e => { e.target.style.display = 'none' }} />
              <div>
                <div className="user-badge__name">{session.user.username}</div>
                <div className="user-badge__sub">Click to sign out</div>
              </div>
            </div>
          ) : (
            <a href={buildFacebookOAuthUrl()} style={{
              position: 'fixed', bottom: 20, left: 16, background: '#1877f2',
              color: '#fff', padding: '8px 16px', borderRadius: 24,
              fontSize: 13, fontWeight: 700, textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              + Add my building
            </a>
          )}

          <SidePanel user={selectedUser} onClose={() => setSelectedUser(null)} />
        </div>
      )}

      {error && <div className="error-toast">{error}</div>}
    </>
  )
}
