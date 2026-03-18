import express from 'express'
import { getActiveAd } from '../db/supabase.js'

const router = express.Router()

// GET /api/ads — public, returns active ad
router.get('/', async (_req, res) => {
  try {
    const ad = await getActiveAd()
    res.json({
      type:      ad?.type      || 'text',
      message:   ad?.message   || 'For ads Contact bollavaramsandeep@gmail.com',
      media_url: ad?.media_url || null,
    })
  } catch (err) {
    res.json({ type: 'text', message: 'For ads Contact bollavaramsandeep@gmail.com', media_url: null })
  }
})

export default router
