import express from 'express'
import crypto from 'crypto'

const router = express.Router()

// POST /api/deletion — Facebook data deletion callback
// Facebook sends a signed_request parameter when a user asks to delete their data.
router.post('/', (req, res) => {
  const { signed_request } = req.body

  if (!signed_request) {
    return res.status(400).json({ error: 'Missing signed_request' })
  }

  try {
    const [encodedSig, payload] = signed_request.split('.')
    const data = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
    const userId = data.user_id || 'unknown'

    // In production: delete user from DB using userId
    // For now we confirm receipt and provide a status URL
    const confirmationCode = crypto.randomBytes(8).toString('hex')

    console.log(`[deletion] Request received for Facebook user: ${userId}`)

    res.json({
      url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/deletion-status?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    })
  } catch (err) {
    console.error('[deletion] Error:', err.message)
    res.status(400).json({ error: 'Invalid signed_request' })
  }
})

export default router
