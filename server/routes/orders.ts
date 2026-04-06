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
    const sortBy = req.query.sortBy as 'totalAmount' | 'giftTotal' | 'giftRatio' | undefined
    const order = req.query.order as 'asc' | 'desc' | undefined

    const orders = await getAllOrders(sortBy, order)

    // Convert to summaries
    const summaries: OrderSummary[] = await Promise.all(
      orders.map(async (o) => {
        const shop = await getShopById(o.shopId)
        // For group orders, always show "拼单" regardless of the actual shop
        const displayName = o.orderType === 'group' ? '拼单' : (shop?.name || '未知店铺')
        return {
          id: o.id,
          sequenceNumber: o.sequenceNumber,
          orderType: o.orderType || 'shop',
          shopName: displayName,
          totalAmount: o.totalAmount,
          giftTotal: o.giftTotal,
          smallGiftTotal: o.smallGiftTotal,
          giftRatio: o.giftRatio,
          note: o.note || '',
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

    // For group orders, get all shops
    let shops: any[] | undefined
    if (order.orderType === 'group' && order.shopIds) {
      shops = await Promise.all(
        order.shopIds.map(async (shopId) => await getShopById(shopId))
      )
      shops = shops.filter(Boolean) // Remove null values
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
      orderType: order.orderType || 'shop',
      shopId: order.shopId,
      shopIds: order.shopIds,
      totalAmount: order.totalAmount,
      giftTotal: order.giftTotal,
      smallGiftTotal: order.smallGiftTotal,
      giftRatio: order.giftRatio,
      createdAt: order.createdAt,
      shop,
      shops,
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
    let giftTotal = 0
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

      const specs: Specification[] = item.specifications || []
      const itemTotal = specs.reduce(
        (sum: number, s: Specification) => sum + s.quantity * s.originalPrice,
        0
      )
      giftTotal += itemTotal

      orderItems.push({
        id: uuidv4(),
        productId: product.id,
        category: 'gift',
        giftType: item.giftType as GiftType,
        customGiftType: item.customGiftType,
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
      giftTotal,
      smallGiftTotal,
      giftRatio,
      createdAt: new Date().toISOString(),
    })

    res.status(201).json(order)
  } catch (err) {
    next(err)
  }
})

// POST /api/orders/group - Create group order
router.post('/group', upload.any(), async (req, res, next) => {
  try {
    const { shops: shopsData } = req.body
    const files = req.files as Express.Multer.File[]

    if (!shopsData) {
      return res.status(400).json({ message: '店铺数据不能为空' })
    }

    const parsedShops = JSON.parse(shopsData)

    if (!Array.isArray(parsedShops) || parsedShops.length === 0) {
      return res.status(400).json({ message: '至少需要一个店铺' })
    }

    const orderItems: OrderItem[] = []
    let totalAmount = 0
    const shopIds: string[] = []

    const findFile = (fieldName: string) =>
      files?.find((f) => f.fieldname === fieldName)

    // Process each shop
    for (let shopIndex = 0; shopIndex < parsedShops.length; shopIndex++) {
      const shopData = parsedShops[shopIndex]
      const { shopName, items } = shopData

      if (!shopName || !shopName.trim()) {
        return res.status(400).json({ message: `店铺 ${shopIndex + 1} 名称不能为空` })
      }

      // Find or create shop
      const shop = await findOrCreateShop(shopName.trim(), uuidv4())
      shopIds.push(shop.id)

      // Process items for this shop
      for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
        const item = items[itemIndex]
        const file = findFile(`shop${shopIndex}_item${itemIndex}`)

        if (!file) {
          return res.status(400).json({
            message: `店铺 ${shopIndex + 1} 的商品 ${itemIndex + 1} 缺少图片`
          })
        }

        const { imagePath, thumbnailPath } = await saveImage(
          file.buffer,
          file.originalname,
          shopName.trim(),
          item.productName
        )

        const product = await findOrCreateProduct(
          item.productName,
          uuidv4(),
          imagePath,
          thumbnailPath
        )

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
          shopId: shop.id, // Track which shop this item belongs to
        })
      }
    }

    // For group orders, create a special "GROUP" shop
    const groupShop = await findOrCreateShop('拼单', uuidv4())

    const order = await createOrder({
      id: uuidv4(),
      orderType: 'group',
      shopId: groupShop.id,
      shopIds,
      items: orderItems,
      totalAmount,
      giftTotal: 0,
      smallGiftTotal: 0,
      giftRatio: 0,
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

    const files = req.files as Express.Multer.File[]
    const findFile = (fieldName: string) =>
      files?.find((f) => f.fieldname === fieldName)

    // Handle group order updates
    if (req.body.orderType === 'group') {
      const { items: itemsData, shopIds: shopIdsData } = req.body
      const parsedItems = JSON.parse(itemsData)
      const parsedShopIds = JSON.parse(shopIdsData)

      const orderItems: OrderItem[] = []
      let totalAmount = 0

      for (const itemData of parsedItems) {
        let productId = itemData.productId

        // Check if new image provided
        const file = findFile(`item_${itemData.id}`)

        if (productId) {
          const existingProduct = await getProductById(productId)
          if (existingProduct && (existingProduct.name !== itemData.productName || file)) {
            // Get shop for image naming
            const itemShop = await getShopById(itemData.shopId)
            const shopName = itemShop?.name || 'Unknown'

            if (file) {
              const { imagePath, thumbnailPath } = await saveImage(file.buffer, file.originalname, shopName, itemData.productName)
              const product = await findOrCreateProduct(itemData.productName, uuidv4(), imagePath, thumbnailPath)
              productId = product.id
            } else {
              const product = await findOrCreateProduct(itemData.productName, uuidv4(), existingProduct.imagePath, existingProduct.thumbnailPath)
              productId = product.id
            }
          }
        } else {
          // New product, must have image
          if (!file) {
            return res.status(400).json({ message: `商品 ${itemData.productName} 缺少图片` })
          }
          const itemShop = await getShopById(itemData.shopId)
          const shopName = itemShop?.name || 'Unknown'
          const { imagePath, thumbnailPath } = await saveImage(file.buffer, file.originalname, shopName, itemData.productName)
          const product = await findOrCreateProduct(itemData.productName, uuidv4(), imagePath, thumbnailPath)
          productId = product.id
        }

        const specs: Specification[] = itemData.specifications || []
        const itemTotal = specs.reduce(
          (sum: number, s: Specification) => sum + s.quantity * (s.purchasePrice || 0),
          0
        )
        totalAmount += itemTotal

        orderItems.push({
          id: itemData.id.startsWith('temp_') ? uuidv4() : itemData.id,
          productId,
          category: 'purchased',
          specifications: specs,
          shopId: itemData.shopId,
        })
      }

      const updated = await updateOrder(id, {
        shopIds: parsedShopIds,
        items: orderItems,
        totalAmount,
        giftTotal: 0,
        smallGiftTotal: 0,
        giftRatio: 0,
      })

      return res.json(updated)
    }

    // Handle regular order updates
    // Check if shop name is being updated
    const newShopName = req.body.shopName
    let shopId = existingOrder.shopId

    if (newShopName && newShopName.trim()) {
      const existingShop = await getShopById(existingOrder.shopId)
      if (!existingShop || existingShop.name !== newShopName.trim()) {
        // Shop name changed, find or create new shop
        const shop = await findOrCreateShop(newShopName.trim(), uuidv4())
        shopId = shop.id
      }
    }

    // Get shop name for image naming
    const shop = await getShopById(shopId)
    const shopName = shop?.name || 'Unknown'

    // Similar logic to POST, but update existing order
    // For now, just update the items
    const { purchasedItems, gifts, smallGifts } = req.body

    const parsedPurchased = purchasedItems ? JSON.parse(purchasedItems) : []
    const parsedGifts = gifts ? JSON.parse(gifts) : []
    const parsedSmallGifts = smallGifts ? JSON.parse(smallGifts) : []

    const orderItems: OrderItem[] = []
    let totalAmount = 0
    let giftTotal = 0
    let smallGiftTotal = 0

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

      const specs: Specification[] = item.specifications || []
      const itemTotal = specs.reduce(
        (sum: number, s: Specification) => sum + s.quantity * s.originalPrice,
        0
      )
      giftTotal += itemTotal

      orderItems.push({
        id: item.id || uuidv4(),
        productId,
        category: 'gift',
        giftType: item.giftType as GiftType,
        customGiftType: item.customGiftType,
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
      shopId,
      items: orderItems,
      totalAmount,
      giftTotal,
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

// PATCH /api/orders/:id/note - Update order note
router.patch('/:id/note', async (req, res, next) => {
  try {
    const { id } = req.params
    const { note } = req.body

    const updated = await updateOrder(id, { note: note || '' })

    if (!updated) {
      return res.status(404).json({ message: '订单不存在' })
    }

    res.json(updated)
  } catch (err) {
    next(err)
  }
})

export default router
