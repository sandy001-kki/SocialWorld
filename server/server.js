import './env.js'   // must be first — loads .env before any other module reads process.env
import express from 'express'
import cors from 'cors'
import authRouter from './routes/auth.js'
import buildingsRouter from './routes/buildings.js'
import userRouter from './routes/user.js'
import adsRouter from './routes/ads.js'

const app = express()

const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://localhost:4173',
]

app.use(cors({
  origin: (origin, cb) => {
    // allow requests with no origin (curl, Postman) in dev
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS blocked for origin: ${origin}`))
  },
  credentials: true,
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }))

app.use('/api/auth', authRouter)
app.use('/api/buildings', buildingsRouter)
app.use('/api/user', userRouter)
app.use('/api/ads', adsRouter)

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[server error]', err.message)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`InstaWorld server running on http://localhost:${PORT}`)
})
