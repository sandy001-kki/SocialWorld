import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

export default supabase

// ---------------------------------------------------------------------------
// User queries
// ---------------------------------------------------------------------------

/** Return all users with the fields needed to render buildings in the world. */
export async function getAllUsers() {
  const { data, error } = await supabase
    .from('users')
    .select(
      'id, instagram_id, username, follower_count, profile_picture_url, building_position_x, building_position_z, created_at'
    )
    .order('follower_count', { ascending: false })

  if (error) throw error
  return data
}

/** Return a single user by their Instagram ID, or null if not found. */
export async function getUserByInstagramId(instagramId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('instagram_id', instagramId)
    .maybeSingle()

  if (error) throw error
  return data
}

/** Return a single user by their username (case-insensitive), or null. */
export async function getUserByUsername(username) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .ilike('username', username)
    .maybeSingle()

  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Grid position assignment
// ---------------------------------------------------------------------------

/**
 * Return a Set of occupied grid-position keys like "120,-75".
 */
async function getOccupiedPositions() {
  const { data, error } = await supabase
    .from('users')
    .select('building_position_x, building_position_z')

  if (error) throw error

  return new Set(data.map(u => `${u.building_position_x},${u.building_position_z}`))
}

/**
 * Walk a spiral of grid cells and return the first unoccupied one.
 *
 * Grid layout:
 *   - Cell spacing: 20 units
 *   - Every 3rd column/row is a road (index mod 3 === 0)
 *   - Valid building cells: indices where (col % 3 !== 0) and (row % 3 !== 0)
 */
export async function assignGridPosition() {
  const occupied = await getOccupiedPositions()
  const SPACING = 20
  const MAX_RANGE = 30 // ±30 cells = ±600 world units

  for (let ring = 1; ring <= MAX_RANGE; ring++) {
    for (let xi = -ring; xi <= ring; xi++) {
      for (let zi = -ring; zi <= ring; zi++) {
        // Only process the outer shell of this ring
        if (Math.abs(xi) !== ring && Math.abs(zi) !== ring) continue
        // Skip road columns / rows (every 3rd index)
        if (xi % 3 === 0 || zi % 3 === 0) continue

        const posX = xi * SPACING
        const posZ = zi * SPACING
        const key = `${posX},${posZ}`

        if (!occupied.has(key)) {
          return { x: posX, z: posZ }
        }
      }
    }
  }

  // Absolute fallback — very far out, random
  const fallback = {
    x: (Math.floor(Math.random() * 60) - 30) * SPACING,
    z: (Math.floor(Math.random() * 60) - 30) * SPACING,
  }
  return fallback
}

// ---------------------------------------------------------------------------
// Ads
// ---------------------------------------------------------------------------

/** Return the single active ad, or null. */
export async function getActiveAd() {
  const { data, error } = await supabase
    .from('ads')
    .select('message, type, media_url')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Upsert
// ---------------------------------------------------------------------------

/**
 * Insert or update a user row.  On conflict on instagram_id the row is updated.
 * Returns the upserted row.
 */
export async function upsertUser(userData) {
  const { data, error } = await supabase
    .from('users')
    .upsert(userData, { onConflict: 'instagram_id' })
    .select()
    .maybeSingle()

  if (error) throw error
  return data
}
