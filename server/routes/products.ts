import { Router } from 'express'
import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import {
  getAllProducts,
  searchProducts,
  updateProductArtist,
  updateProductStyle,
  updateProductRelations,
  loadDatabase,
  DATA_DIR,
} from '../services/database.js'
import { buildProductAssociations, relatedProductIds, isValidArtist, isValidStyle, isValidProductStyle } from '../services/productAssociations.js'
import { buildRelationIndex, linkCandidates, relationMembers, relationTargets } from '../services/productRelations.js'
import { selectImagesForSnapshot } from '../services/imageResolution.js'
import type { ProductDetail, ProductEntry, ProductSearchType, GiftType } from '../../src/types/index.js'

const router = Router()
const ORIGINAL_DIR = path.join(DATA_DIR, 'images', 'original')
const APPEND_DIR = path.join(DATA_DIR, 'append')

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
    const type = req.query.type as ProductSearchType
    const keyword = (req.query.keyword as string) || ''

    if (type && type !== 'productName' && type !== 'shopName' && type !== 'artist') {
      return res.status(400).json({ message: '无效的搜索类型' })
    }

    const style = req.query.style
    if (style !== undefined && !isValidProductStyle(style)) {
      return res.status(400).json({ message: '无效的风格分类' })
    }

    const products = await searchProducts(type || 'productName', keyword, req.query.exact === 'true', style, req.query.groupRelated === 'true')
    res.json(products)
  } catch (err) {
    next(err)
  }
})

// GET /api/products/link-candidates - Explicit choices from other recorded shops
router.get('/link-candidates', async (req, res, next) => {
  try {
    const shopName = req.query.shopName
    const keyword = req.query.keyword ?? ''
    const productId = req.query.productId
    if (typeof shopName !== 'string' || !shopName.trim() || typeof keyword !== 'string' ||
      (productId !== undefined && typeof productId !== 'string')) {
      return res.status(400).json({ message: '请提供有效的源店铺和搜索参数' })
    }
    const index = buildRelationIndex(await loadDatabase())
    if (productId !== undefined) {
      const source = index.byId.get(productId)
      if (!source || source.reference.shopName.trim().toLowerCase() !== shopName.trim().toLowerCase()) {
        return res.status(400).json({ message: '源商品不存在或不属于当前店铺' })
      }
    }
    res.json(linkCandidates(index, shopName, keyword, productId))
  } catch (err) {
    next(err)
  }
})

router.get('/:id/relations', async (req, res, next) => {
  try {
    const db = await loadDatabase()
    if (!db.products.some(product => product.id === req.params.id)) {
      return res.status(404).json({ message: '商品不存在' })
    }
    if (!db.productLinks?.length) return res.json([])
    res.json(relationTargets(buildRelationIndex(db), req.params.id))
  } catch (err) {
    next(err)
  }
})

router.put('/:id/relations', async (req, res, next) => {
  try {
    const targets = await updateProductRelations(req.params.id, req.body?.productIds)
    if (!targets) return res.status(404).json({ message: '商品不存在' })
    res.json(targets)
  } catch (err) {
    if ((err as { status?: number }).status === 400) {
      return res.status(400).json({ message: (err as Error).message })
    }
    next(err)
  }
})

// GET /api/products/set-products - Get products with significant set quantities
router.get('/set-products', async (req, res, next) => {
  try {
    const db = await loadDatabase()
    const shopMap = new Map(db.shops.map((s) => [s.id, s]))
    const productMap = new Map(db.products.map((p) => [p.id, p]))

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
        const product = productMap.get(item.productId)
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

// GET /api/products/loose-items - Get products with loose item quantities
router.get('/loose-items', async (req, res, next) => {
  try {
    const db = await loadDatabase()
    const shopMap = new Map(db.shops.map((s) => [s.id, s]))
    const productMap = new Map(db.products.map((p) => [p.id, p]))

    // Aggregate loose item quantities by shop+productName combination
    const productLooseCounts = new Map<string, {
      productId: string
      productName: string
      shopName: string
      imagePath: string
      thumbnailPath: string
      折页: number
      异形折页: number
      卡头: Record<number, number> // sequenceNumber -> quantity
      卡背: number
      封口贴: Record<number, number> // sequenceNumber -> quantity
      长贴: Record<number, number> // sequenceNumber -> quantity
      其他贴纸: Record<string, number> // "customType_seqNum" -> quantity
      贴纸包: number
      封箱贴: number
      豆丁贴: number
      gift贴: number
      售后卡: number
      磨砂盒: number
      其他衍生: Record<string, number> // "customType_seqNum" -> quantity
    }>()

    for (const order of db.orders) {
      for (const item of order.items) {
        const product = productMap.get(item.productId)
        if (!product) continue

        // Determine shop name for this product
        const shopId = order.orderType === 'group' ? item.shopId : order.shopId
        const shop = shopId ? shopMap.get(shopId) : null
        const shopName = shop?.name || (order.orderType === 'group' ? '拼单' : '未知店铺')

        // Use shop+productName as key to merge same shop's duplicate products
        const key = `${shopName.toLowerCase()}|${product.name.toLowerCase()}`
        if (!productLooseCounts.has(key)) {
          productLooseCounts.set(key, {
            productId: product.id,
            productName: product.name,
            shopName,
            imagePath: product.imagePath,
            thumbnailPath: product.thumbnailPath,
            折页: 0,
            异形折页: 0,
            卡头: {},
            卡背: 0,
            封口贴: {},
            长贴: {},
            其他贴纸: {},
            贴纸包: 0,
            封箱贴: 0,
            豆丁贴: 0,
            gift贴: 0,
            售后卡: 0,
            磨砂盒: 0,
            其他衍生: {},
          })
        }

        const counts = productLooseCounts.get(key)!
        for (const spec of item.specifications) {
          if (spec.type === '折页') {
            counts.折页 += spec.quantity
          } else if (spec.type === '异形折页') {
            counts.异形折页 += spec.quantity
          } else if (spec.type === '卡头') {
            const seqNum = spec.sequenceNumber || 1
            counts.卡头[seqNum] = (counts.卡头[seqNum] || 0) + spec.quantity
          } else if (spec.type === '卡背') {
            counts.卡背 += spec.quantity
          } else if (spec.type === '封口贴') {
            const seqNum = spec.sequenceNumber || 1
            counts.封口贴[seqNum] = (counts.封口贴[seqNum] || 0) + spec.quantity
          } else if (spec.type === '长贴') {
            const seqNum = spec.sequenceNumber || 1
            counts.长贴[seqNum] = (counts.长贴[seqNum] || 0) + spec.quantity
          } else if (spec.type === '其他贴纸') {
            const customName = spec.customType || '其他贴纸'
            const seqNum = spec.sequenceNumber || 1
            const key = `${customName}_${seqNum}`
            counts.其他贴纸[key] = (counts.其他贴纸[key] || 0) + spec.quantity
          } else if (spec.type === '贴纸包') {
            counts.贴纸包 += spec.quantity
          } else if (spec.type === '封箱贴') {
            counts.封箱贴 += spec.quantity
          } else if (spec.type === '豆丁贴') {
            counts.豆丁贴 += spec.quantity
          } else if (spec.type === 'gift贴') {
            counts.gift贴 += spec.quantity
          } else if (spec.type === '售后卡') {
            counts.售后卡 += spec.quantity
          } else if (spec.type === '磨砂盒') {
            counts.磨砂盒 += spec.quantity
          } else if (spec.type === '其他衍生') {
            const customName = spec.customType || '其他衍生'
            const seqNum = spec.sequenceNumber || 1
            const key = `${customName}_${seqNum}`
            counts.其他衍生[key] = (counts.其他衍生[key] || 0) + spec.quantity
          }
        }
      }
    }

    // Filter products: has any loose item quantity > 0
    const looseProducts = Array.from(productLooseCounts.values())
      .filter(p =>
        p.折页 > 0 || p.异形折页 > 0 || Object.keys(p.卡头).length > 0 || p.卡背 > 0 ||
        Object.keys(p.封口贴).length > 0 || Object.keys(p.长贴).length > 0 ||
        Object.keys(p.其他贴纸).length > 0 || p.贴纸包 > 0 ||
        p.封箱贴 > 0 || p.豆丁贴 > 0 || p.gift贴 > 0 || p.售后卡 > 0 ||
        p.磨砂盒 > 0 || Object.keys(p.其他衍生).length > 0
      )

    res.json(looseProducts)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/products/:id/artist - Sync the same products aggregated by detail
router.patch('/:id/artist', async (req, res, next) => {
  try {
    const artist = req.body?.artist
    if (!isValidArtist(artist)) {
      return res.status(400).json({ message: '美工必须为字符串' })
    }
    const product = await updateProductArtist(req.params.id, artist)
    if (!product) {
      return res.status(404).json({ message: '商品不存在' })
    }
    res.json(product)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/products/:id/style - Same-shop/name synchronization, independent of artist
router.patch('/:id/style', async (req, res, next) => {
  try {
    const style = req.body?.style
    if (!isValidStyle(style)) {
      return res.status(400).json({ message: '无效的风格分类' })
    }
    const product = await updateProductStyle(req.params.id, style)
    if (!product) {
      return res.status(404).json({ message: '商品不存在' })
    }
    res.json(product)
  } catch (err) {
    next(err)
  }
})

// GET /api/products/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const db = await loadDatabase()
    const associations = buildProductAssociations(db)
    const product = associations.products.get(id)

    if (!product) {
      return res.status(404).json({ message: '商品不存在' })
    }

    const shopMap = new Map(db.shops.map((s) => [s.id, s]))

    const matchingProductIds = relatedProductIds(associations, id)
    const relations = db.productLinks?.length ? buildRelationIndex(db, associations) : undefined
    const members = relations ? relationMembers(relations, id) : []
    const memberEntries = new Map(members.map(member => [member.key, {
      purchased: [] as ProductEntry[],
      gifts: [] as (ProductEntry & { giftType: GiftType })[],
      smallGifts: [] as ProductEntry[],
    }]))

    // Calculate group sequence numbers
    const groupOrders = db.orders
      .filter(o => o.orderType === 'group')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const groupSeqMap = new Map<string, number>()
    groupOrders.forEach((o, idx) => groupSeqMap.set(o.id, idx + 1))

    const purchased: ProductEntry[] = []
    const gifts: (ProductEntry & { giftType: GiftType })[] = []
    const smallGifts: ProductEntry[] = []

    for (const order of db.orders) {
      for (const item of order.items) {
        const isSource = matchingProductIds.has(item.productId)
        const key = relations?.byId.get(item.productId)?.key
        const linkedEntries = key ? memberEntries.get(key) : undefined
        if (!isSource && !linkedEntries) continue

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

        for (const entries of [isSource ? { purchased, gifts, smallGifts } : undefined, linkedEntries]) {
          if (!entries) continue
          if (item.category === 'purchased') {
            entries.purchased.push(entry)
          } else if (item.category === 'gift') {
            entries.gifts.push({ ...entry, giftType: item.giftType! })
          } else if (item.category === 'smallGift') {
            entries.smallGifts.push(entry)
          }
        }
      }
    }

    const detail: ProductDetail = {
      ...product,
      entries: { purchased, gifts, smallGifts },
    }
    if (relations && members.length > 1) {
      detail.linkedProducts = members.map(member => ({ ...member.reference, entries: memberEntries.get(member.key)! }))
      detail.relationTargets = relationTargets(relations, id)
      const selectImage = selectImagesForSnapshot(ORIGINAL_DIR)
      const image = await selectImage(members.flatMap(member => [...member.ids].map(productId => associations.products.get(productId)!)))
      if (image) detail.displayImage = image
    }

    res.json(detail)
  } catch (err) {
    next(err)
  }
})

// POST /api/products/merge-images - Merge selected product images into a 6:9 grid
router.post('/merge-images', async (req, res, next) => {
  try {
    const { imagePaths } = req.body as { imagePaths: string[] }

    if (!imagePaths || !Array.isArray(imagePaths) || imagePaths.length === 0) {
      return res.status(400).json({ message: '请选择至少一张图片' })
    }

    if (imagePaths.length > 9) {
      return res.status(400).json({ message: '最多选择9张图片' })
    }

    // Ensure append directory exists
    await fs.mkdir(APPEND_DIR, { recursive: true })

    // Load all images and get their dimensions
    const imageInfos: { buffer: Buffer; width: number; height: number }[] = []
    for (const imagePath of imagePaths) {
      const fullPath = path.join(ORIGINAL_DIR, imagePath)
      const buffer = await fs.readFile(fullPath)
      const metadata = await sharp(buffer).metadata()
      imageInfos.push({
        buffer,
        width: metadata.width || 0,
        height: metadata.height || 0,
      })
    }

    // Calculate grid layout based on number of images
    // Target: final image should have 6:9 aspect ratio (width:height)
    const count = imageInfos.length
    let cols: number
    let rows: number
    if (count <= 1) {
      cols = 1
      rows = 1
    } else if (count <= 2) {
      cols = 1
      rows = 2
    } else if (count <= 3) {
      cols = 1
      rows = 3
    } else if (count <= 4) {
      cols = 2
      rows = 2
    } else if (count <= 6) {
      cols = 2
      rows = 3
    } else {
      cols = 3
      rows = 3
    }

    // Final canvas has 6:9 ratio (width:height = 6/9 = 2/3)
    const canvasWidth = 1200
    const canvasHeight = 1800

    // Each cell size
    const cellWidth = canvasWidth / cols
    const cellHeight = canvasHeight / rows

    // Resize each image to fit cell size
    const resizedImages: { buffer: Buffer; x: number; y: number }[] = []
    for (let i = 0; i < imageInfos.length; i++) {
      const row = Math.floor(i / cols)
      const col = i % cols
      const x = Math.round(col * cellWidth)
      const y = Math.round(row * cellHeight)

      const resized = await sharp(imageInfos[i].buffer)
        .resize(Math.round(cellWidth), Math.round(cellHeight), { fit: 'cover', position: 'center' })
        .toBuffer()

      resizedImages.push({ buffer: resized, x, y })
    }

    // Create composite image
    const composite = await sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite(
        resizedImages.map((img) => ({
          input: img.buffer,
          left: img.x,
          top: img.y,
        }))
      )
      .jpeg({ quality: 95 })
      .toBuffer()

    // Save to append folder with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `merged_${timestamp}.jpg`
    const outputPath = path.join(APPEND_DIR, filename)
    await fs.writeFile(outputPath, composite)

    res.json({
      success: true,
      filename,
      path: `/append/${filename}`,
      count: imagePaths.length,
    })
  } catch (err) {
    next(err)
  }
})

export default router
