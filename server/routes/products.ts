import { Router } from 'express'
import {
  getAllProducts,
  getProductById,
  searchProducts,
  loadDatabase,
  getAllShops,
} from '../services/database.js'
import type { ProductDetail, ProductEntry } from '../../src/types/index.js'

const router = Router()

// GET /api/products
router.get('/', async (req, res, next) => {
  try {
    const products = await getAllProducts()
    res.json(products)
  } catch (err) {
    next(err)
  }
})

// GET /api/products/search
router.get('/search', async (req, res, next) => {
  try {
    const type = req.query.type as 'productName' | 'shopName'
    const keyword = (req.query.keyword as string) || ''

    if (type && type !== 'productName' && type !== 'shopName') {
      return res.status(400).json({ message: '无效的搜索类型' })
    }

    const products = await searchProducts(type || 'productName', keyword)
    res.json(products)
  } catch (err) {
    next(err)
  }
})

// GET /api/products/set-products - Get products with significant set quantities
router.get('/set-products', async (req, res, next) => {
  try {
    const db = await loadDatabase()
    const shops = await getAllShops()
    const shopMap = new Map(shops.map((s) => [s.id, s]))

    // Aggregate set quantities by shop+productName combination
    const productSetCounts = new Map<string, {
      productId: string
      productName: string
      shopName: string
      imagePath: string
      thumbnailPath: string
      大食量set: number
      小食量set: number
      试吃set: number
    }>()

    for (const order of db.orders) {
      for (const item of order.items) {
        const product = await getProductById(item.productId)
        if (!product) continue

        // Determine shop name for this product
        const shopId = order.orderType === 'group' ? item.shopId : order.shopId
        const shop = shopId ? shopMap.get(shopId) : null
        const shopName = shop?.name || (order.orderType === 'group' ? '拼单' : '未知店铺')

        // Use shop+productName as key to merge same shop's duplicate products
        const key = `${shopName.toLowerCase()}|${product.name.toLowerCase()}`
        if (!productSetCounts.has(key)) {
          productSetCounts.set(key, {
            productId: product.id,
            productName: product.name,
            shopName,
            imagePath: product.imagePath,
            thumbnailPath: product.thumbnailPath,
            大食量set: 0,
            小食量set: 0,
            试吃set: 0,
          })
        }

        const counts = productSetCounts.get(key)!
        for (const spec of item.specifications) {
          if (spec.type === '大食量set') {
            counts.大食量set += spec.quantity
          } else if (spec.type === '小食量set') {
            counts.小食量set += spec.quantity
          } else if (spec.type === '试吃set') {
            counts.试吃set += spec.quantity
          }
        }
      }
    }

    // Filter products: has 大set or 小set, or 试吃set >= 5
    const setProducts = Array.from(productSetCounts.values())
      .filter(p => p.大食量set > 0 || p.小食量set > 0 || p.试吃set >= 5)
      .sort((a, b) => {
        // Sort by: 大set > 小set > 试吃set
        if (a.大食量set !== b.大食量set) return b.大食量set - a.大食量set
        if (a.小食量set !== b.小食量set) return b.小食量set - a.小食量set
        return b.试吃set - a.试吃set
      })

    res.json(setProducts)
  } catch (err) {
    next(err)
  }
})

// GET /api/products/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const product = await getProductById(id)

    if (!product) {
      return res.status(404).json({ message: '商品不存在' })
    }

    const db = await loadDatabase()
    const shops = await getAllShops()
    const shopMap = new Map(shops.map((s) => [s.id, s]))

    // First, determine the shop for this product by finding its first order
    let productShopName: string | null = null
    for (const order of db.orders) {
      for (const item of order.items) {
        if (item.productId === id) {
          const shopId = order.orderType === 'group' ? item.shopId : order.shopId
          const shop = shopId ? shopMap.get(shopId) : null
          productShopName = shop?.name || null
          break
        }
      }
      if (productShopName) break
    }

    // Find all productIds that match the same shop + product name combination
    const matchingProductIds = new Set<string>()
    matchingProductIds.add(id) // Always include the requested product

    if (productShopName) {
      for (const order of db.orders) {
        for (const item of order.items) {
          const itemProduct = await getProductById(item.productId)
          if (!itemProduct) continue

          // Check if this item's shop matches
          const shopId = order.orderType === 'group' ? item.shopId : order.shopId
          const shop = shopId ? shopMap.get(shopId) : null
          const itemShopName = shop?.name || null

          // Match by shop name + product name
          if (itemShopName === productShopName &&
              itemProduct.name.toLowerCase() === product.name.toLowerCase()) {
            matchingProductIds.add(item.productId)
          }
        }
      }
    }

    // Calculate group sequence numbers
    const groupOrders = db.orders
      .filter(o => o.orderType === 'group')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const groupSeqMap = new Map<string, number>()
    groupOrders.forEach((o, idx) => groupSeqMap.set(o.id, idx + 1))

    const purchased: ProductEntry[] = []
    const gifts: (ProductEntry & { giftType: string })[] = []
    const smallGifts: ProductEntry[] = []

    for (const order of db.orders) {
      for (const item of order.items) {
        // Match by any of the matching productIds (same shop + product name)
        if (!matchingProductIds.has(item.productId)) continue

        // For group orders, use item.shopId; for regular orders, use order.shopId
        const shopId = order.orderType === 'group' ? item.shopId : order.shopId
        const shop = shopId ? shopMap.get(shopId) : null
        const shopName = shop?.name || (order.orderType === 'group' ? '拼单' : '未知店铺')

        const entry: ProductEntry = {
          orderId: order.id,
          orderSequence: order.sequenceNumber,
          groupSequenceNumber: order.orderType === 'group' ? groupSeqMap.get(order.id) : undefined,
          orderType: order.orderType || 'shop',
          shopName,
          specifications: item.specifications,
        }

        if (item.category === 'purchased') {
          purchased.push(entry)
        } else if (item.category === 'gift') {
          gifts.push({ ...entry, giftType: item.giftType! })
        } else if (item.category === 'smallGift') {
          smallGifts.push(entry)
        }
      }
    }

    const detail: ProductDetail = {
      ...product,
      entries: { purchased, gifts, smallGifts },
    }

    res.json(detail)
  } catch (err) {
    next(err)
  }
})

export default router
