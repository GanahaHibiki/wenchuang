import { Router } from 'express'
import multer from 'multer'
import { saveImage } from '../services/imageService.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

// POST /api/images/upload
router.post('/upload', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '请上传图片' })
    }

    const result = await saveImage(req.file.buffer, req.file.originalname)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

export default router
