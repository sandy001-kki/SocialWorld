import express from 'express'
import jwt from 'jsonwebtoken'
import { getUserByUsername } from '../db/supabase.js'
import { fetchUserMedia } from '../instagramAuth.js'

const router = express.Router()

// ---------------------------------------------------------------------------
// Middleware: optionally verify JWT and attach accessToken to req
// Non-authenticated requests still work — they just won't get media posts.
// ---------------------------------------------------------------------------
function optionalAuth(req, _res, next) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET)
      req.auth = payload
    } catch {
      // expired / invalid — continue without auth
    }
  }
  next()
}

// ---------------------------------------------------------------------------
// GET /api/user/:username
// Returns a user's profile and (if authenticated as that user) recent media.
// ---------------------------------------------------------------------------
router.get('/:username', optionalAuth, async (req, res) => {
  try {
    const { username } = req.params
    const user = await getUserByUsername(username)

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const response = {
      id: user.id,
      username: user.username,
      follower_count: user.follower_count,
      profile_picture_url: user.profile_picture_url,
      position: {
        x: user.building_position_x,
        z: user.building_position_z,
      },
      created_at: user.created_at,
      posts: [],
    }

    // Fetch media only if the requesting user owns this profile
    if (req.auth?.username === username && req.auth?.accessToken) {
      response.posts = await fetchUserMedia(req.auth.accessToken, 6)
    }

    res.json(response)
  } catch (err) {
    console.error('[user] error:', err.message)
    res.status(500).json({ error: 'Failed to load user' })
  }
})

export default router
