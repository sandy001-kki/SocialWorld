import express from 'express'
import jwt from 'jsonwebtoken'
import {
  exchangeCodeForToken,
  getLongLivedToken,
  fetchUserProfile,
} from '../facebookAuth.js'
import {
  getUserByInstagramId,
  upsertUser,
  assignGridPosition,
} from '../db/supabase.js'

const router = express.Router()

// ---------------------------------------------------------------------------
// POST /api/auth/facebook
// Body: { code: string }
// Exchanges a Facebook OAuth code for a session JWT.
// ---------------------------------------------------------------------------
router.post('/facebook', async (req, res) => {
  try {
    const { code } = req.body
    if (!code) return res.status(400).json({ error: 'Missing auth code' })

    // 1. Exchange code → short-lived token
    const { access_token: shortToken } = await exchangeCodeForToken(code)

    // 2. Upgrade to long-lived token (~60 days)
    let accessToken = shortToken
    try {
      const long = await getLongLivedToken(shortToken)
      accessToken = long.access_token
    } catch (e) {
      console.warn('[auth] long-lived token upgrade failed:', e.message)
    }

    // 3. Fetch Facebook profile
    const profile = await fetchUserProfile(accessToken)
    const pictureUrl = profile.picture?.data?.url || ''

    // Use Facebook ID as the unique identifier (reusing instagram_id column)
    const userId = String(profile.id)
    let existingUser = await getUserByInstagramId(userId)

    let position = existingUser
      ? { x: existingUser.building_position_x, z: existingUser.building_position_z }
      : await assignGridPosition()

    // Realistic follower proxy (100–2000 range) derived from Facebook ID
    const seed = userId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const pseudoFollowers = (seed % 1900) + 100

    const userData = {
      instagram_id: userId,           // reusing column for Facebook ID
      username: profile.name.replace(/\s+/g, '_').toLowerCase(),
      follower_count: existingUser?.follower_count ?? pseudoFollowers,
      profile_picture_url: pictureUrl,
      building_position_x: position.x,
      building_position_z: position.z,
      ...(existingUser ? {} : { created_at: new Date().toISOString() }),
    }

    const user = await upsertUser(userData)

    // 4. Issue JWT
    const token = jwt.sign(
      { userId: user.id, fbId: userId, username: user.username, accessToken },
      process.env.JWT_SECRET,
      { expiresIn: '60d' }
    )

    res.json({ token, user })
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message
    console.error('[auth] error:', detail)
    res.status(500).json({ error: 'Authentication failed', detail })
  }
})

// ---------------------------------------------------------------------------
// GET /api/auth/callback
// Facebook redirects here with ?code=...
// ---------------------------------------------------------------------------
router.get('/callback', (req, res) => {
  const { code, error } = req.query
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'

  if (error) return res.redirect(`${clientUrl}/?auth_error=${encodeURIComponent(error)}`)
  if (!code) return res.redirect(`${clientUrl}/?auth_error=missing_code`)

  res.redirect(`${clientUrl}/?code=${encodeURIComponent(code)}`)
})

export default router
