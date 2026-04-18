import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'

import { DATA_DIR } from './services/database.js'
import shopsRouter from './routes/shops.js'
import productsRouter from './routes/products.js'
import ordersRouter from './routes/orders.js'
import imagesRouter from './routes/images.js'
import wishesRouter from './routes/wishes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const PORT = 3001

// Middleware
app.use(cors())
app.use(express.json())

// Static files for images
app.use('/images/original', express.static(path.join(DATA_DIR, 'images', 'original')))
app.use('/images/thumbnails', express.static(path.join(DATA_DIR, 'images', 'thumbnails')))

// API Routes
app.use('/api/shops', shopsRouter)
app.use('/api/products', productsRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/images', imagesRouter)
app.use('/api/wishes', wishesRouter)

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err)

  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: `Upload error: ${err.message}` })
  }

  res.status(500).json({ message: err.message || 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
  console.log(`Data directory: ${DATA_DIR}`)
})
