/**
 * Instagram API helpers (new Instagram Login — replaces deprecated Basic Display API).
 *
 * Uses instagram_basic scope which provides id, username, profile_picture_url,
 * followers_count, and media access via graph.instagram.com.
 */

import axios from 'axios'

const {
  INSTAGRAM_APP_ID,
  INSTAGRAM_APP_SECRET,
  INSTAGRAM_REDIRECT_URI,
} = process.env

/**
 * Exchange the short-lived OAuth code for a short-lived access token.
 * Returns { access_token, user_id }
 */
export async function exchangeCodeForToken(code) {
  const params = new URLSearchParams({
    client_id: INSTAGRAM_APP_ID,
    client_secret: INSTAGRAM_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: INSTAGRAM_REDIRECT_URI,
    code,
  })

  const { data } = await axios.post(
    'https://api.instagram.com/oauth/access_token',
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )
  return data // { access_token, user_id }
}

/**
 * Upgrade a short-lived token to a long-lived token (60-day expiry).
 * Returns { access_token, token_type, expires_in }
 */
export async function getLongLivedToken(shortLivedToken) {
  const { data } = await axios.get(
    'https://graph.instagram.com/access_token',
    {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: INSTAGRAM_APP_SECRET,
        access_token: shortLivedToken,
      },
    }
  )
  return data
}

/**
 * Fetch the authenticated user's profile.
 * Returns { id, username, account_type, media_count, profile_picture_url }
 */
export async function fetchUserProfile(accessToken) {
  const { data } = await axios.get('https://graph.instagram.com/me', {
    params: {
      fields: 'id,username,account_type,media_count,profile_picture_url',
      access_token: accessToken,
    },
  })
  return data
}

/**
 * Fetch the authenticated user's most recent media (up to 6 items).
 * Returns { data: [ { id, media_type, media_url, thumbnail_url, permalink, timestamp } ] }
 */
export async function fetchUserMedia(accessToken, limit = 6) {
  try {
    const { data } = await axios.get('https://graph.instagram.com/me/media', {
      params: {
        fields: 'id,media_type,media_url,thumbnail_url,permalink,timestamp,caption',
        limit,
        access_token: accessToken,
      },
    })
    return data.data || []
  } catch (err) {
    // Media fetch is non-critical — return empty array on failure
    console.warn('[instagram] media fetch failed:', err.response?.data?.error?.message || err.message)
    return []
  }
}
