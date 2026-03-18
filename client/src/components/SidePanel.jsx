import { useEffect, useState } from 'react'
import { fetchUser } from '../api.js'

const DEFAULT_AVATAR = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"%3E%3Ccircle cx="32" cy="32" r="32" fill="%23333"/%3E%3Ccircle cx="32" cy="26" r="10" fill="%23666"/%3E%3Cellipse cx="32" cy="52" rx="16" ry="12" fill="%23666"/%3E%3C/svg%3E'

function formatCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

export default function SidePanel({ user, onClose }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const isOpen = !!user

  useEffect(() => {
    if (!user) { setDetail(null); return }

    setLoading(true)
    setError(null)
    setDetail(null)

    fetchUser(user.username)
      .then(data => setDetail(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [user?.username])

  const displayUser = detail || user

  return (
    <aside className={`side-panel ${isOpen ? 'open' : ''}`} aria-label="Profile panel">
      {isOpen && (
        <>
          <div className="side-panel__header">
            <div className="side-panel__profile">
              <img
                className="side-panel__avatar"
                src={displayUser?.profile_picture_url || DEFAULT_AVATAR}
                alt={displayUser?.username}
                onError={e => { e.target.src = DEFAULT_AVATAR }}
              />
              <div>
                <div className="side-panel__username">@{displayUser?.username}</div>
                <div className="side-panel__followers">
                  {formatCount(displayUser?.follower_count ?? 0)} followers (est.)
                </div>
                {detail?.created_at && (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                    Joined {new Date(detail.created_at).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
            <button className="side-panel__close" onClick={onClose} aria-label="Close panel">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Building stats */}
          <div className="side-panel__section">
            <h4>Building Stats</h4>
            <div style={{ display: 'flex', gap: 16 }}>
              <Stat label="Followers" value={formatCount(displayUser?.follower_count ?? 0)} />
              <Stat label="Height" value={`${Math.log10(Math.max(displayUser?.follower_count ?? 10, 10)) * 10 | 0}u`} />
            </div>
          </div>

          {/* Posts grid */}
          <div className="side-panel__section">
            <h4>Recent Posts</h4>
            {loading && (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div className="spinner" style={{ margin: '0 auto' }} />
              </div>
            )}
            {error && <p className="no-posts">Could not load posts — {error}</p>}
            {!loading && !error && (
              detail?.posts?.length > 0 ? (
                <div className="posts-grid">
                  {detail.posts.map(post => (
                    <a
                      key={post.id}
                      href={post.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={post.caption || ''}
                    >
                      <img
                        src={post.media_type === 'VIDEO' ? post.thumbnail_url : post.media_url}
                        alt={post.caption || 'Post'}
                        loading="lazy"
                        onError={e => { e.target.style.display = 'none' }}
                      />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="no-posts">
                  {detail
                    ? 'No posts available — log in to load your posts'
                    : 'Loading…'}
                </p>
              )
            )}
          </div>

          {/* Instagram link */}
          <div className="side-panel__section">
            <a
              href={`https://www.instagram.com/${displayUser?.username}/`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 13, color: '#c77dff', textDecoration: 'none',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                <circle cx="12" cy="12" r="4"/>
                <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
              </svg>
              View on Instagram
            </a>
          </div>
        </>
      )}
    </aside>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px 14px', flex: 1 }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{label}</div>
    </div>
  )
}
