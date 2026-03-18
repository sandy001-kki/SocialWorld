/**
 * api.js — All HTTP calls from the SocialWorld frontend.
 */

const API_URL = import.meta.env.VITE_API_URL || ''

function authHeader() {
  const token = localStorage.getItem('sw_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function handleResponse(res) {
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || json.detail || `HTTP ${res.status}`)
  return json
}

// ---------------------------------------------------------------------------
// Buildings — public, no auth
// ---------------------------------------------------------------------------
export async function fetchBuildings() {
  const res = await fetch(`${API_URL}/api/buildings`)
  return handleResponse(res)
}

// ---------------------------------------------------------------------------
// Auth — Facebook Login
// ---------------------------------------------------------------------------
export async function authenticateFacebook(code) {
  const res = await fetch(`${API_URL}/api/auth/facebook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  return handleResponse(res)
}

// ---------------------------------------------------------------------------
// User profile
// ---------------------------------------------------------------------------
export async function fetchUser(username) {
  const res = await fetch(`${API_URL}/api/user/${encodeURIComponent(username)}`, {
    headers: authHeader(),
  })
  return handleResponse(res)
}

// ---------------------------------------------------------------------------
// Ads — public
// ---------------------------------------------------------------------------
export async function fetchAd() {
  const res = await fetch(`${API_URL}/api/ads`)
  const json = await res.json().catch(() => ({}))
  return {
    type:      json.type      || 'text',
    message:   json.message   || 'For ads Contact bollavaramsandeep@gmail.com',
    media_url: json.media_url || null,
  }
}

// ---------------------------------------------------------------------------
// Facebook OAuth URL
// ---------------------------------------------------------------------------
export function buildFacebookOAuthUrl() {
  const appId = import.meta.env.VITE_FACEBOOK_APP_ID
  const redirectUri = import.meta.env.VITE_FACEBOOK_REDIRECT_URI

  const params = new URLSearchParams({
    client_id: appId || '',
    redirect_uri: redirectUri || `${window.location.origin}/callback`,
    scope: 'public_profile',
    response_type: 'code',
  })

  return `https://www.facebook.com/dialog/oauth?${params}`
}
