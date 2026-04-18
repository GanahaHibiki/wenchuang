import { Router } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import {
  getAllWishItems,
  createWishItem,
  deleteWishItem,
  deleteWishItemByProductName,
  searchWishProducts,
  getWishProductsByShopName,
  getShopById,
  findOrCreateShop,
} from '../services/database.js'
import { saveImage } from '../services/imageService.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

// Get all wish products
router.get('/', async (req, res, next) => {
  try {
    const products = await searchWishProducts('productName', '')
    res.json(products)
  } catch (error) {
    next(error)
  }
})

// Search wish products
router.get('/search', async (req, res, next) => {
  try {
    const { type, keyword } = req.query
    const products = await searchWishProducts(
      type as 'productName' | 'shopName',
      (keyword as string) || ''
    )
    res.json(products)
  } catch (error) {
    next(error)
  }
})

// Get wish products by shop name
router.get('/by-shop', async (req, res, next) => {
  try {
    const { shopName } = req.query
    if (!shopName) {
      return res.json([])
    }
    const products = await getWishProductsByShopName(shopName as string)
    res.json(products)
  } catch (error) {
    next(error)
  }
})

// Create wish item
router.post('/', upload.single('image'), async (req, res, next) => {
  try {
    const { shopName, productName, shopId: existingShopId } = req.body
    const imageFile = req.file

    if (!shopName || !productName) {
      return res.status(400).json({ message: '店铺名和商品名为必填项' })
    }

    if (!imageFile) {
      return res.status(400).json({ message: '商品图片为必填项' })
    }

    // Find or create shop
    const shopId = existingShopId || uuidv4()
    const shop = await findOrCreateShop(shopName, shopId)

    // Save image
    const { imagePath, thumbnailPath } = await saveImage(imageFile.buffer, imageFile.originalname)

    // Create product
    const productId = uuidv4()

    // Create wish item
    const wishItem = await createWishItem({
      id: uuidv4(),
      shopId: shop.id,
      productId,
      productName,
      imagePath,
      thumbnailPath,
      createdAt: new Date().toISOString(),
    })

    res.status(201).json(wishItem)
  } catch (error) {
    next(error)
  }
})

// Delete wish item by id
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const success = await deleteWishItem(id)

    if (!success) {
      return res.status(404).json({ message: '心愿商品不存在' })
    }

    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

// Delete wish item by shop name and product name
router.delete('/by-product', async (req, res, next) => {
  try {
    const { shopName, productName } = req.query
    if (!shopName || !productName) {
      return res.status(400).json({ message: '店铺名和商品名为必填项' })
    }

    const success = await deleteWishItemByProductName(
      shopName as string,
      productName as string
    )

    res.json({ success })
  } catch (error) {
    next(error)
  }
})

export default router
