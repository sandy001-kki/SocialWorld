import express from 'express'
import { getAllUsers } from '../db/supabase.js'

const router = express.Router()

// ---------------------------------------------------------------------------
// GET /api/buildings
// Public endpoint — returns all users as building data so guests can
// explore the world before logging in.
// ---------------------------------------------------------------------------
router.get('/', async (_req, res) => {
  try {
    const users = await getAllUsers()

    // Strip access tokens / sensitive fields before sending to client
    const buildings = users.map(u => ({
      id: u.id,
      username: u.username,
      follower_count: u.follower_count,
      profile_picture_url: u.profile_picture_url,
      position: {
        x: u.building_position_x,
        z: u.building_position_z,
      },
    }))

    res.json({ buildings })
  } catch (err) {
    console.error('[buildings] error:', err.message)
    res.status(500).json({ error: 'Failed to load buildings' })
  }
})

export default router
