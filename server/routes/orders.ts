import { Router } from 'express'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import {
  getAllOrders,
  getOrderById,
  createOrder,
  updateOrder,
  deleteOrder,
  findOrCreateShop,
  findOrCreateProduct,
  getShopById,
  getProductById,
} from '../services/database.js'
import { saveImage } from '../services/imageService.js'
import type {
  Order,
  OrderItem,
  OrderSummary,
  OrderDetail,
  Specification,
  GiftType,
} from '../../src/types/index.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

// GET /api/orders
router.get('/', async (req, res, next) => {
  try {
    const sortBy = req.query.sortBy as 'totalAmount' | 'giftRatio' | undefined
    const order = req.query.order as 'asc' | 'desc' | undefined

    const orders = await getAllOrders(sortBy, order)

    // Convert to summaries
    const summaries: OrderSummary[] = await Promise.all(
      orders.map(async (o) => {
        const shop = await getShopById(o.shopId)
        return {
          id: o.id,
          sequenceNumber: o.sequenceNumber,
          shopName: shop?.name || '未知店铺',
          totalAmount: o.totalAmount,
          smallGiftTotal: o.smallGiftTotal,
          giftRatio: o.giftRatio,
        }
      })
    )

    res.json(summaries)
  } catch (err) {
    next(err)
  }
})

// GET /api/orders/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const order = await getOrderById(id)

    if (!order) {
      return res.status(404).json({ message: '订单不存在' })
    }

    const shop = await getShopById(order.shopId)
    if (!shop) {
      return res.status(404).json({ message: '店铺不存在' })
    }

    // Group items by category with product details
    const purchasedItems: (OrderItem & { product: any })[] = []
    const gifts: (OrderItem & { product: any })[] = []
    const smallGifts: (OrderItem & { product: any })[] = []

    for (const item of order.items) {
      const product = await getProductById(item.productId)
      const itemWithProduct = { ...item, product }

      if (item.category === 'purchased') {
        purchasedItems.push(itemWithProduct)
      } else if (item.category === 'gift') {
        gifts.push(itemWithProduct)
      } else if (item.category === 'smallGift') {
        smallGifts.push(itemWithProduct)
      }
    }

    const detail: OrderDetail = {
      id: order.id,
      sequenceNumber: order.sequenceNumber,
      shopId: order.shopId,
      totalAmount: order.totalAmount,
      smallGiftTotal: order.smallGiftTotal,
      giftRatio: order.giftRatio,
      createdAt: order.createdAt,
      shop,
      purchasedItems,
      gifts,
      smallGifts,
    }

    res.json(detail)
  } catch (err) {
    next(err)
  }
})

// POST /api/orders
router.post('/', upload.any(), async (req, res, next) => {
  try {
    const { shopName, purchasedItems, gifts, smallGifts } = req.body
    const files = req.files as Express.Multer.File[]

    if (!shopName) {
      return res.status(400).json({ message: '店铺名称不能为空' })
    }

    // Parse JSON strings from form data
    const parsedPurchased = purchasedItems ? JSON.parse(purchasedItems) : []
    const parsedGifts = gifts ? JSON.parse(gifts) : []
    const parsedSmallGifts = smallGifts ? JSON.parse(smallGifts) : []

    // Create or find shop
    const shop = await findOrCreateShop(shopName, uuidv4())

    // Process items and calculate totals
    const orderItems: OrderItem[] = []
    let totalAmount = 0
    let smallGiftTotal = 0

    // Helper to find file by field name
    const findFile = (fieldName: string) =>
      files?.find((f) => f.fieldname === fieldName)

    // Process purchased items
    for (let i = 0; i < parsedPurchased.length; i++) {
      const item = parsedPurchased[i]
      const file = findFile(`purchasedImage_${i}`)

      if (!file) {
        return res.status(400).json({ message: `已购商品 ${i + 1} 缺少图片` })
      }

      const { imagePath, thumbnailPath } = await saveImage(file.buffer, file.originalname, shopName, item.productName)
      const product = await findOrCreateProduct(item.productName, uuidv4(), imagePath, thumbnailPath)

      const specs: Specification[] = item.specifications || []
      const itemTotal = specs.reduce(
        (sum: number, s: Specification) => sum + s.quantity * (s.purchasePrice || 0),
        0
      )
      totalAmount += itemTotal

      orderItems.push({
        id: uuidv4(),
        productId: product.id,
        category: 'purchased',
        specifications: specs,
      })
    }

    // Process gifts
    for (let i = 0; i < parsedGifts.length; i++) {
      const item = parsedGifts[i]
      const file = findFile(`giftImage_${i}`)

      if (!file) {
        return res.status(400).json({ message: `礼品 ${i + 1} 缺少图片` })
      }

      const { imagePath, thumbnailPath } = await saveImage(file.buffer, file.originalname, shopName, item.productName)
      const product = await findOrCreateProduct(item.productName, uuidv4(), imagePath, thumbnailPath)

      orderItems.push({
        id: uuidv4(),
        productId: product.id,
        category: 'gift',
        giftType: item.giftType as GiftType,
        specifications: item.specifications || [],
      })
    }

    // Process small gifts
    for (let i = 0; i < parsedSmallGifts.length; i++) {
      const item = parsedSmallGifts[i]
      const file = findFile(`smallGiftImage_${i}`)

      if (!file) {
        return res.status(400).json({ message: `小礼物 ${i + 1} 缺少图片` })
      }

      const { imagePath, thumbnailPath } = await saveImage(file.buffer, file.originalname, shopName, item.productName)
      const product = await findOrCreateProduct(item.productName, uuidv4(), imagePath, thumbnailPath)

      const specs: Specification[] = item.specifications || []
      const itemTotal = specs.reduce(
        (sum: number, s: Specification) => sum + s.quantity * s.originalPrice,
        0
      )
      smallGiftTotal += itemTotal

      orderItems.push({
        id: uuidv4(),
        productId: product.id,
        category: 'smallGift',
        specifications: specs,
      })
    }

    // Calculate gift ratio
    const giftRatio = totalAmount > 0 ? Math.round((smallGiftTotal / totalAmount) * 1000) / 10 : 0

    const order = await createOrder({
      id: uuidv4(),
      shopId: shop.id,
      items: orderItems,
      totalAmount,
      smallGiftTotal,
      giftRatio,
      createdAt: new Date().toISOString(),
    })

    res.status(201).json(order)
  } catch (err) {
    next(err)
  }
})

// PUT /api/orders/:id
router.put('/:id', upload.any(), async (req, res, next) => {
  try {
    const { id } = req.params
    const existingOrder = await getOrderById(id)

    if (!existingOrder) {
      return res.status(404).json({ message: '订单不存在' })
    }

    // Get shop name for image naming
    const shop = await getShopById(existingOrder.shopId)
    const shopName = shop?.name || 'Unknown'

    // Similar logic to POST, but update existing order
    // For now, just update the items
    const { purchasedItems, gifts, smallGifts } = req.body
    const files = req.files as Express.Multer.File[]

    const parsedPurchased = purchasedItems ? JSON.parse(purchasedItems) : []
    const parsedGifts = gifts ? JSON.parse(gifts) : []
    const parsedSmallGifts = smallGifts ? JSON.parse(smallGifts) : []

    const orderItems: OrderItem[] = []
    let totalAmount = 0
    let smallGiftTotal = 0

    const findFile = (fieldName: string) =>
      files?.find((f) => f.fieldname === fieldName)

    // Process purchased items
    for (let i = 0; i < parsedPurchased.length; i++) {
      const item = parsedPurchased[i]

      let productId = item.productId

      // Check if product name changed or new image provided
      const file = findFile(`purchasedImage_${i}`)
      if (productId) {
        const existingProduct = await getProductById(productId)
        // If name changed or new image, create new product
        if (existingProduct && (existingProduct.name !== item.productName || file)) {
          if (file) {
            const { imagePath, thumbnailPath } = await saveImage(file.buffer, file.originalname, shopName, item.productName)
            const product = await findOrCreateProduct(item.productName, uuidv4(), imagePath, thumbnailPath)
            productId = product.id
          } else {
            // Name changed but no new image, reuse existing image
            const product = await findOrCreateProduct(item.productName, uuidv4(), existingProduct.imagePath, existingProduct.thumbnailPath)
            productId = product.id
          }
        }
      } else {
        // New product, must have image
        if (!file) {
          return res.status(400).json({ message: `已购商品 ${i + 1} 缺少图片` })
        }
        const { imagePath, thumbnailPath } = await saveImage(file.buffer, file.originalname, shopName, item.productName)
        const product = await findOrCreateProduct(item.productName, uuidv4(), imagePath, thumbnailPath)
        productId = product.id
      }

      const specs: Specification[] = item.specifications || []
      const itemTotal = specs.reduce(
        (sum: number, s: Specification) => sum + s.quantity * (s.purchasePrice || 0),
        0
      )
      totalAmount += itemTotal

      orderItems.push({
        id: item.id || uuidv4(),
        productId,
        category: 'purchased',
        specifications: specs,
      })
    }

    // Process gifts
    for (let i = 0; i < parsedGifts.length; i++) {
      const item = parsedGifts[i]

      let productId = item.productId

      // Check if product name changed or new image provided
      const file = findFile(`giftImage_${i}`)
      if (productId) {
        const existingProduct = await getProductById(productId)
        // If name changed or new image, create new product
        if (existingProduct && (existingProduct.name !== item.productName || file)) {
          if (file) {
            const { imagePath, thumbnailPath } = await saveImage(file.buffer, file.originalname, shopName, item.productName)
            const product = await findOrCreateProduct(item.productName, uuidv4(), imagePath, thumbnailPath)
            productId = product.id
          } else {
            // Name changed but no new image, reuse existing image
            const product = await findOrCreateProduct(item.productName, uuidv4(), existingProduct.imagePath, existingProduct.thumbnailPath)
            productId = product.id
          }
        }
      } else {
        // New product, must have image
        if (!file) {
          return res.status(400).json({ message: `礼品 ${i + 1} 缺少图片` })
        }
        const { imagePath, thumbnailPath } = await saveImage(file.buffer, file.originalname, shopName, item.productName)
        const product = await findOrCreateProduct(item.productName, uuidv4(), imagePath, thumbnailPath)
        productId = product.id
      }

      orderItems.push({
        id: item.id || uuidv4(),
        productId,
        category: 'gift',
        giftType: item.giftType as GiftType,
        specifications: item.specifications || [],
      })
    }

    // Process small gifts
    for (let i = 0; i < parsedSmallGifts.length; i++) {
      const item = parsedSmallGifts[i]

      let productId = item.productId

      // Check if product name changed or new image provided
      const file = findFile(`smallGiftImage_${i}`)
      if (productId) {
        const existingProduct = await getProductById(productId)
        // If name changed or new image, create new product
        if (existingProduct && (existingProduct.name !== item.productName || file)) {
          if (file) {
            const { imagePath, thumbnailPath } = await saveImage(file.buffer, file.originalname, shopName, item.productName)
            const product = await findOrCreateProduct(item.productName, uuidv4(), imagePath, thumbnailPath)
            productId = product.id
          } else {
            // Name changed but no new image, reuse existing image
            const product = await findOrCreateProduct(item.productName, uuidv4(), existingProduct.imagePath, existingProduct.thumbnailPath)
            productId = product.id
          }
        }
      } else {
        // New product, must have image
        if (!file) {
          return res.status(400).json({ message: `小礼物 ${i + 1} 缺少图片` })
        }
        const { imagePath, thumbnailPath } = await saveImage(file.buffer, file.originalname, shopName, item.productName)
        const product = await findOrCreateProduct(item.productName, uuidv4(), imagePath, thumbnailPath)
        productId = product.id
      }

      const specs: Specification[] = item.specifications || []
      const itemTotal = specs.reduce(
        (sum: number, s: Specification) => sum + s.quantity * s.originalPrice,
        0
      )
      smallGiftTotal += itemTotal

      orderItems.push({
        id: item.id || uuidv4(),
        productId,
        category: 'smallGift',
        specifications: specs,
      })
    }

    const giftRatio = totalAmount > 0 ? Math.round((smallGiftTotal / totalAmount) * 1000) / 10 : 0

    const updated = await updateOrder(id, {
      items: orderItems,
      totalAmount,
      smallGiftTotal,
      giftRatio,
    })

    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/orders/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const success = await deleteOrder(id)

    if (!success) {
      return res.status(404).json({ message: '订单不存在' })
    }

    res.json({ success: true, message: '订单已删除' })
  } catch (err) {
    next(err)
  }
})

export default router
