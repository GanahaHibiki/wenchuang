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
  updateWishItem,
  getWishItemById,
  getWishItemByShopAndProduct,
} from '../services/database.js'
import { saveImage, deleteImage } from '../services/imageService.js'

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

    // Save image with wish naming convention: 心愿_店铺名_商品名
    const { imagePath, thumbnailPath } = await saveImage(imageFile.buffer, imageFile.originalname, `心愿_${shopName}`, productName)

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

// Delete wish item by shop name and product name
// This route must be before /:id to avoid being matched as an id
router.delete('/by-product', async (req, res, next) => {
  try {
    const { shopName, productName } = req.query
    if (!shopName || !productName) {
      return res.status(400).json({ message: '店铺名和商品名为必填项' })
    }

    // Get the wish item first to get its image path
    const wishItem = await getWishItemByShopAndProduct(
      shopName as string,
      productName as string
    )

    if (wishItem) {
      // Delete the image files
      await deleteImage(wishItem.imagePath)
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

// Update wish item
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const { productName, shopName } = req.body

    console.log('Update wish item:', { id, productName, shopName })

    let shopId: string | undefined
    if (shopName) {
      const shop = await findOrCreateShop(shopName, uuidv4())
      console.log('Found/created shop:', shop)
      shopId = shop.id
    }

    const updated = await updateWishItem(id, { productName, shopId })
    console.log('Updated wish item:', updated)

    if (!updated) {
      return res.status(404).json({ message: '心愿商品不存在' })
    }

    res.json(updated)
  } catch (error) {
    next(error)
  }
})

// Delete wish item by id
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params

    // Get the wish item first to get its image path
    const wishItem = await getWishItemById(id)

    if (!wishItem) {
      return res.status(404).json({ message: '心愿商品不存在' })
    }

    // Delete the image files
    await deleteImage(wishItem.imagePath)

    const success = await deleteWishItem(id)

    res.json({ success: true })
  } catch (error) {
    next(error)
  }
})

export default router
