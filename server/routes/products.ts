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

// GET /api/products/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const product = await getProductById(id)

    if (!product) {
      return res.status(404).json({ message: '商品不存在' })
    }

    // Get all entries for this product across orders
    // Search by product name instead of productId to capture all instances
    const db = await loadDatabase()
    const shops = await getAllShops()
    const shopMap = new Map(shops.map((s) => [s.id, s]))

    const purchased: ProductEntry[] = []
    const gifts: (ProductEntry & { giftType: string })[] = []
    const smallGifts: ProductEntry[] = []

    for (const order of db.orders) {
      for (const item of order.items) {
        // Get the product for this item
        const itemProduct = await getProductById(item.productId)
        if (!itemProduct) continue

        // Match by product name (case-insensitive)
        if (itemProduct.name.toLowerCase() !== product.name.toLowerCase()) continue

        // For group orders, use item.shopId; for regular orders, use order.shopId
        const shopId = order.orderType === 'group' ? item.shopId : order.shopId
        const shop = shopId ? shopMap.get(shopId) : null
        const shopName = shop?.name || (order.orderType === 'group' ? '拼单' : '未知店铺')

        const entry: ProductEntry = {
          orderId: order.id,
          orderSequence: order.sequenceNumber,
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
