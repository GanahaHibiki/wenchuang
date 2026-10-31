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
  updateProductNameById,
  updateProduct,
  getShopById,
  getProductById,
  renameShop,
  loadDatabase,
} from '../services/database.js'
import { saveImage, copyAndRenameImage, deleteImage } from '../services/imageService.js'
import { buildProductAssociations, productGroupKey, hasInvalidArtists, orderArtistInput } from '../services/productAssociations.js'
import type { OrderArtistInput } from '../services/productAssociations.js'
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

    const db = await loadDatabase()
    const orders = await getAllOrders(sortBy, order, db)
    const shopMap = new Map(db.shops.map(shop => [shop.id, shop]))

    // Calculate group sequence numbers (order within group orders by createdAt)
    const groupOrders = orders
      .filter(o => o.orderType === 'group')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const groupSeqMap = new Map<string, number>()
    groupOrders.forEach((o, idx) => groupSeqMap.set(o.id, idx + 1))

    // Convert to summaries
    const summaries: OrderSummary[] = orders.map((o) => {
        const shop = shopMap.get(o.shopId)
        // For group orders, show custom name or default "拼单"
        const displayName = o.orderType === 'group'
          ? (o.groupOrderName || '拼单')
          : (shop?.name || '未知店铺')
        return {
          id: o.id,
          sequenceNumber: o.sequenceNumber,
          groupSequenceNumber: o.orderType === 'group' ? groupSeqMap.get(o.id) : undefined,
          orderType: o.orderType || 'shop',
          shopName: displayName,
          totalAmount: o.totalAmount,
          giftTotal: o.giftTotal,
          smallGiftTotal: o.smallGiftTotal,
          giftRatio: o.giftRatio,
          note: o.note || '',
          deliveryStatus: o.deliveryStatus || '未到货',
          orderTime: o.orderTime,
          shippingTime: o.shippingTime,
        }
      })

    res.json(summaries)
  } catch (err) {
    next(err)
  }
})

// GET /api/orders/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const db = await loadDatabase()
    const order = await getOrderById(id, db)
    const shopMap = new Map(db.shops.map(shop => [shop.id, shop]))
    const productMap = new Map(db.products.map(product => [product.id, product]))

    if (!order) {
      return res.status(404).json({ message: '订单不存在' })
    }

    // For group orders, shopId may be null - skip shop check
    let shop = null
    if (order.orderType !== 'group') {
      shop = shopMap.get(order.shopId)
      if (!shop) {
        return res.status(404).json({ message: '店铺不存在' })
      }
    }

    // For group orders, get all shops and calculate group sequence number
    let shops: any[] | undefined
    let groupSequenceNumber: number | undefined
    if (order.orderType === 'group') {
      if (order.shopIds) {
        shops = order.shopIds.map(shopId => shopMap.get(shopId)).filter(Boolean)
      }
      // Calculate group sequence number
      const allOrders = await getAllOrders(undefined, undefined, db)
      const groupOrders = allOrders
        .filter(o => o.orderType === 'group')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      groupSequenceNumber = groupOrders.findIndex(o => o.id === id) + 1
    }

    // Group items by category with product details
    const purchasedItems: (OrderItem & { product: any })[] = []
    const gifts: (OrderItem & { product: any })[] = []
    const smallGifts: (OrderItem & { product: any })[] = []

    for (const item of order.items) {
      const product = productMap.get(item.productId)
      const itemWithProduct = { ...item, product }

      if (item.category === 'purchased') {
        purchasedItems.push(itemWithProduct)
      } else if (item.category === 'gift') {
        gifts.push(itemWithProduct)
      } else if (item.category === 'smallGift') {
        smallGifts.push(itemWithProduct)
      }
    }

    const detail: OrderDetail & { groupSequenceNumber?: number; groupOrderName?: string } = {
      id: order.id,
      sequenceNumber: order.sequenceNumber,
      groupSequenceNumber,
      orderType: order.orderType || 'shop',
      shopId: order.shopId,
      shopIds: order.shopIds,
      groupOrderName: order.groupOrderName,
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
    if (hasInvalidArtists([...parsedPurchased, ...parsedGifts, ...parsedSmallGifts])) {
      return res.status(400).json({ message: '美工作者必须为字符串' })
    }

    // Create or find shop
    const shop = await findOrCreateShop(shopName, uuidv4())

    // Process items and calculate totals
    const artists: OrderArtistInput[] = []
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

      let imagePath: string
      let thumbnailPath: string

      if (file) {
        const saved = await saveImage(file.buffer, file.originalname, shopName, item.productName)
        imagePath = saved.imagePath
        thumbnailPath = saved.thumbnailPath
      } else if (item.existingImagePath) {
        const renamed = await copyAndRenameImage(item.existingImagePath, shopName, item.productName)
        imagePath = renamed.imagePath
        thumbnailPath = renamed.thumbnailPath
      } else {
        return res.status(400).json({ message: `已购商品 ${i + 1} 缺少图片` })
      }

      const product = await findOrCreateProduct(item.productName, uuidv4(), imagePath, thumbnailPath)
      artists.push(orderArtistInput(product.id, item))

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

      let imagePath: string
      let thumbnailPath: string

      if (file) {
        const saved = await saveImage(file.buffer, file.originalname, shopName, item.productName)
        imagePath = saved.imagePath
        thumbnailPath = saved.thumbnailPath
      } else if (item.existingImagePath) {
        const renamed = await copyAndRenameImage(item.existingImagePath, shopName, item.productName)
        imagePath = renamed.imagePath
        thumbnailPath = renamed.thumbnailPath
      } else {
        return res.status(400).json({ message: `礼品 ${i + 1} 缺少图片` })
      }

      const product = await findOrCreateProduct(item.productName, uuidv4(), imagePath, thumbnailPath)
      artists.push(orderArtistInput(product.id, item))

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

      let imagePath: string
      let thumbnailPath: string

      if (file) {
        const saved = await saveImage(file.buffer, file.originalname, shopName, item.productName)
        imagePath = saved.imagePath
        thumbnailPath = saved.thumbnailPath
      } else if (item.existingImagePath) {
        const renamed = await copyAndRenameImage(item.existingImagePath, shopName, item.productName)
        imagePath = renamed.imagePath
        thumbnailPath = renamed.thumbnailPath
      } else {
        return res.status(400).json({ message: `小礼物 ${i + 1} 缺少图片` })
      }

      const product = await findOrCreateProduct(item.productName, uuidv4(), imagePath, thumbnailPath)
      artists.push(orderArtistInput(product.id, item))

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
    }, artists)

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

    if (hasInvalidArtists(parsedShops.flatMap(shop => shop.items || []))) {
      return res.status(400).json({ message: '美工作者必须为字符串' })
    }
    const associations = buildProductAssociations(await loadDatabase())
    const artists: OrderArtistInput[] = []
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

        let product: any

        if (file) {
          // New image uploaded
          const { imagePath, thumbnailPath } = await saveImage(
            file.buffer,
            file.originalname,
            shopName.trim(),
            item.productName
          )

          product = await findOrCreateProduct(
            item.productName,
            uuidv4(),
            imagePath,
            thumbnailPath
          )
        } else if (item.existingImagePath) {
          // Use existing image path (from wish or other products) - copy and rename
          const renamed = await copyAndRenameImage(item.existingImagePath, shopName.trim(), item.productName)
          product = await findOrCreateProduct(
            item.productName,
            uuidv4(),
            renamed.imagePath,
            renamed.thumbnailPath
          )
        } else {
          // Reuse only a product associated with this shop, never a namesake from another shop.
          const ids = associations.groups.get(productGroupKey(shop.name, item.productName))
          const selectedId = ids?.has(item.productId) ? item.productId : ids?.values().next().value
          const existingProduct = selectedId ? associations.products.get(selectedId) : undefined

          if (existingProduct) {
            product = existingProduct
          } else {
            return res.status(400).json({
              message: `店铺 ${shopIndex + 1} 的商品 ${itemIndex + 1} "${item.productName}" 缺少图片`
            })
          }
        }

        associations.products.set(product.id, product)
        const key = productGroupKey(shop.name, item.productName)
        let ids = associations.groups.get(key)
        if (!ids) {
          ids = new Set<string>()
          associations.groups.set(key, ids)
        }
        ids.add(product.id)
        artists.push(orderArtistInput(product.id, { ...item, shopId: shop.id }))

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
    }, artists)

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
      const { items: itemsData, shopIds: shopIdsData, shopNames: shopNamesData } = req.body
      const parsedItems = JSON.parse(itemsData)
      const parsedShopIds = JSON.parse(shopIdsData)
      const parsedShopNames = shopNamesData ? JSON.parse(shopNamesData) : {}
      if (hasInvalidArtists(parsedItems)) {
        return res.status(400).json({ message: '美工作者必须为字符串' })
      }
      const artists: OrderArtistInput[] = []

      // Update or create shops
      for (const shopId of parsedShopIds) {
        const shopName = parsedShopNames[shopId]
        if (shopName) {
          const existingShop = await getShopById(shopId)
          if (existingShop) {
            if (existingShop.name !== shopName) {
              // Shop name changed, rename shop and sync all related data
              await renameShop(shopId, shopName)
            }
          } else {
            // New shop, create it with the provided ID
            await findOrCreateShop(shopName, shopId)
          }
        }
      }

      const orderItems: OrderItem[] = []
      let totalAmount = 0

      for (const itemData of parsedItems) {
        let productId = itemData.productId

        // Check if new image provided
        const file = findFile(`item_${itemData.id}`)

        if (productId) {
          const existingProduct = await getProductById(productId)
          if (existingProduct) {
            // Get shop for image naming
            const itemShop = await getShopById(itemData.shopId)
            const shopName = itemShop?.name || 'Unknown'
            const nameChanged = existingProduct.name !== itemData.productName

            if (file && !nameChanged) {
              // Only image changed (name stays the same) - update this product directly by ID
              const oldImagePath = existingProduct.imagePath
              const { imagePath, thumbnailPath } = await saveImage(file.buffer, file.originalname, shopName, itemData.productName)
              await updateProduct(productId, { imagePath, thumbnailPath })
              // Delete old image files only if the path changed (different filename)
              if (oldImagePath !== imagePath) {
                await deleteImage(oldImagePath)
              }
            } else if (file && nameChanged) {
              // Both name and image changed - create new product
              const { imagePath, thumbnailPath } = await saveImage(file.buffer, file.originalname, shopName, itemData.productName)
              const product = await findOrCreateProduct(itemData.productName, uuidv4(), imagePath, thumbnailPath)
              productId = product.id
            } else if (nameChanged) {
              // Only name changed - update existing product name (treat as same product)
              await updateProductNameById(productId, itemData.productName)
            }
            // If nothing changed, keep the same productId
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

        artists.push(orderArtistInput(productId, itemData))
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
      }, artists)

      return res.json(updated)
    }

    // Handle regular order updates: validate artist before any shop/image mutations.
    const { purchasedItems, gifts, smallGifts } = req.body
    const parsedPurchased = purchasedItems ? JSON.parse(purchasedItems) : []
    const parsedGifts = gifts ? JSON.parse(gifts) : []
    const parsedSmallGifts = smallGifts ? JSON.parse(smallGifts) : []
    if (hasInvalidArtists([...parsedPurchased, ...parsedGifts, ...parsedSmallGifts])) {
      return res.status(400).json({ message: '美工作者必须为字符串' })
    }
    const artists: OrderArtistInput[] = []

    // Check if shop name is being updated
    const newShopName = req.body.shopName
    let shopId = existingOrder.shopId

    if (newShopName && newShopName.trim()) {
      const existingShop = await getShopById(existingOrder.shopId)
      if (existingShop && existingShop.name !== newShopName.trim()) {
        // Shop name changed, rename existing shop and sync all related data
        await renameShop(existingOrder.shopId, newShopName.trim())
      } else if (!existingShop) {
        // Shop doesn't exist (shouldn't happen), create new one
        const shop = await findOrCreateShop(newShopName.trim())
        shopId = shop.id
      }
    }

    // Get shop name for image naming
    const shop = await getShopById(shopId)
    const shopName = shop?.name || 'Unknown'

    // Similar logic to POST, but update existing order items.
    const orderItems: OrderItem[] = []
    let totalAmount = 0
    let giftTotal = 0
    let smallGiftTotal = 0

    // Track productId changes to sync across categories
    const productIdMapping = new Map<string, string>() // oldId -> newId

    // Process purchased items
    for (let i = 0; i < parsedPurchased.length; i++) {
      const item = parsedPurchased[i]

      let productId = item.productId
      const originalProductId = productId

      // Check if product name changed or new image provided
      const file = findFile(`purchasedImage_${i}`)
      if (productId) {
        const existingProduct = await getProductById(productId)
        if (existingProduct) {
          const nameChanged = existingProduct.name !== item.productName

          if (file && !nameChanged) {
            // Only image changed (name stays the same) - update this product directly by ID
            const oldImagePath = existingProduct.imagePath
            const { imagePath, thumbnailPath } = await saveImage(file.buffer, file.originalname, shopName, item.productName)
            await updateProduct(productId, { imagePath, thumbnailPath })
            // Delete old image files only if the path changed
            if (oldImagePath !== imagePath) {
              await deleteImage(oldImagePath)
            }
          } else if (file && nameChanged) {
            // Both name and image changed - create new product
            const { imagePath, thumbnailPath } = await saveImage(file.buffer, file.originalname, shopName, item.productName)
            const product = await findOrCreateProduct(item.productName, uuidv4(), imagePath, thumbnailPath)
            productId = product.id
            productIdMapping.set(originalProductId, productId)
          } else if (nameChanged) {
            // Only name changed - update existing product name (treat as same product)
            await updateProductNameById(productId, item.productName)
          }
          // If nothing changed, keep the same productId
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

      artists.push(orderArtistInput(productId, item))
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

      // Check if this productId was updated in purchased items
      let productId = productIdMapping.get(item.productId) || item.productId
      const originalProductId = item.productId

      // Check if product name changed or new image provided
      const file = findFile(`giftImage_${i}`)
      if (productId) {
        const existingProduct = await getProductById(productId)
        if (existingProduct) {
          const nameChanged = existingProduct.name !== item.productName

          if (file && !nameChanged) {
            // Only image changed (name stays the same) - update this product directly by ID
            const oldImagePath = existingProduct.imagePath
            const { imagePath, thumbnailPath } = await saveImage(file.buffer, file.originalname, shopName, item.productName)
            await updateProduct(productId, { imagePath, thumbnailPath })
            // Delete old image files only if the path changed
            if (oldImagePath !== imagePath) {
              await deleteImage(oldImagePath)
            }
          } else if (file && nameChanged) {
            // Both name and image changed - create new product
            const { imagePath, thumbnailPath } = await saveImage(file.buffer, file.originalname, shopName, item.productName)
            const product = await findOrCreateProduct(item.productName, uuidv4(), imagePath, thumbnailPath)
            productId = product.id
            if (!productIdMapping.has(originalProductId)) {
              productIdMapping.set(originalProductId, productId)
            }
          } else if (nameChanged) {
            // Only name changed - update existing product name (treat as same product)
            await updateProductNameById(productId, item.productName)
          }
          // If nothing changed, keep the same productId
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

      artists.push(orderArtistInput(productId, item))
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

      // Check if this productId was updated in purchased items or gifts
      let productId = productIdMapping.get(item.productId) || item.productId

      // Check if product name changed or new image provided
      const file = findFile(`smallGiftImage_${i}`)
      if (productId) {
        const existingProduct = await getProductById(productId)
        if (existingProduct) {
          const nameChanged = existingProduct.name !== item.productName

          if (file && !nameChanged) {
            // Only image changed (name stays the same) - update this product directly by ID
            const oldImagePath = existingProduct.imagePath
            const { imagePath, thumbnailPath } = await saveImage(file.buffer, file.originalname, shopName, item.productName)
            await updateProduct(productId, { imagePath, thumbnailPath })
            // Delete old image files only if the path changed
            if (oldImagePath !== imagePath) {
              await deleteImage(oldImagePath)
            }
          } else if (file && nameChanged) {
            // Both name and image changed - create new product
            const { imagePath, thumbnailPath } = await saveImage(file.buffer, file.originalname, shopName, item.productName)
            const product = await findOrCreateProduct(item.productName, uuidv4(), imagePath, thumbnailPath)
            productId = product.id
          } else if (nameChanged) {
            // Only name changed - update existing product name (treat as same product)
            await updateProductNameById(productId, item.productName)
          }
          // If nothing changed, keep the same productId
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

      artists.push(orderArtistInput(productId, item))
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
    }, artists)

    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/orders/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const result = await deleteOrder(id)

    if (!result.success) {
      return res.status(404).json({ message: '订单不存在' })
    }

    // Delete image files for orphaned products
    for (const product of result.deletedProducts) {
      await deleteImage(product.imagePath)
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

// PATCH /api/orders/:id/delivery-status - Update order delivery status
router.patch('/:id/delivery-status', async (req, res, next) => {
  try {
    const { id } = req.params
    const { deliveryStatus } = req.body

    if (deliveryStatus && deliveryStatus !== '未到货' && deliveryStatus !== '已到货') {
      return res.status(400).json({ message: '无效的到货状态' })
    }

    const updated = await updateOrder(id, { deliveryStatus: deliveryStatus || '未到货' })

    if (!updated) {
      return res.status(404).json({ message: '订单不存在' })
    }

    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/orders/:id/order-time - Update order time
router.patch('/:id/order-time', async (req, res, next) => {
  try {
    const { id } = req.params
    const { orderTime } = req.body

    // Validate ISO format if provided
    if (orderTime && orderTime !== '') {
      const date = new Date(orderTime)
      if (isNaN(date.getTime())) {
        return res.status(400).json({ message: '无效的下单时间格式' })
      }
    }

    const updated = await updateOrder(id, { orderTime: orderTime || undefined })

    if (!updated) {
      return res.status(404).json({ message: '订单不存在' })
    }

    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/orders/:id/shipping-time - Update shipping time
router.patch('/:id/shipping-time', async (req, res, next) => {
  try {
    const { id } = req.params
    const { shippingTime } = req.body

    // Validate ISO format if provided
    if (shippingTime && shippingTime !== '') {
      const date = new Date(shippingTime)
      if (isNaN(date.getTime())) {
        return res.status(400).json({ message: '无效的发货时间格式' })
      }
    }

    const updated = await updateOrder(id, { shippingTime: shippingTime || undefined })

    if (!updated) {
      return res.status(404).json({ message: '订单不存在' })
    }

    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/orders/:id/group-order-name - Update group order name
router.patch('/:id/group-order-name', async (req, res, next) => {
  try {
    const { id } = req.params
    const { groupOrderName } = req.body

    const existingOrder = await getOrderById(id)
    if (!existingOrder) {
      return res.status(404).json({ message: '订单不存在' })
    }

    if (existingOrder.orderType !== 'group') {
      return res.status(400).json({ message: '只有拼单订单可以修改订单名称' })
    }

    const updated = await updateOrder(id, { groupOrderName: groupOrderName || '拼单' })

    if (!updated) {
      return res.status(404).json({ message: '订单不存在' })
    }

    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/orders/:id/items/:itemId/arrived - Update item arrival status
router.patch('/:id/items/:itemId/arrived', async (req, res, next) => {
  try {
    const { id, itemId } = req.params
    const { arrived } = req.body

    const existingOrder = await getOrderById(id)
    if (!existingOrder) {
      return res.status(404).json({ message: '订单不存在' })
    }

    if (existingOrder.orderType !== 'group') {
      return res.status(400).json({ message: '只有拼单订单可以更新商品到货状态' })
    }

    // Find and update the item
    const updatedItems = existingOrder.items.map(item =>
      item.id === itemId ? { ...item, arrived: arrived === true } : item
    )

    const itemFound = updatedItems.some(item => item.id === itemId)
    if (!itemFound) {
      return res.status(404).json({ message: '商品不存在' })
    }

    // Check if all items are arrived
    const allArrived = updatedItems.every(item => item.arrived === true)

    // Update order with new items and delivery status
    const updated = await updateOrder(id, {
      items: updatedItems,
      deliveryStatus: allArrived ? '已到货' : existingOrder.deliveryStatus
    })

    if (!updated) {
      return res.status(404).json({ message: '更新失败' })
    }

    res.json(updated)
  } catch (err) {
    next(err)
  }
})

export default router
