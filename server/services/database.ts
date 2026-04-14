import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import type { Database, Shop, Product, Order } from '../../src/types/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '../../data')
const DB_PATH = path.join(DATA_DIR, 'db.json')
const BACKUPS_DIR = path.join(DATA_DIR, 'backups')

const DEFAULT_DB: Database = {
  version: '1.0',
  lastModified: new Date().toISOString(),
  nextOrderSequence: 1,
  shops: [],
  products: [],
  orders: [],
}

async function ensureDirectories() {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.mkdir(BACKUPS_DIR, { recursive: true })
  await fs.mkdir(path.join(DATA_DIR, 'images', 'original'), { recursive: true })
  await fs.mkdir(path.join(DATA_DIR, 'images', 'thumbnails'), { recursive: true })
}

async function loadDatabase(): Promise<Database> {
  await ensureDirectories()

  try {
    const content = await fs.readFile(DB_PATH, 'utf-8')
    const db = JSON.parse(content)

    // Check if sequence numbers need reordering (if there are gaps or duplicates)
    if (db.orders && db.orders.length > 0) {
      const sequenceNumbers = db.orders.map((o: Order) => o.sequenceNumber).sort((a: number, b: number) => a - b)
      let needsReorder = false

      // Check for gaps or duplicates
      for (let i = 0; i < sequenceNumbers.length; i++) {
        if (sequenceNumbers[i] !== i + 1) {
          needsReorder = true
          break
        }
      }

      // Check for duplicates
      const uniqueSeqs = new Set(sequenceNumbers)
      if (uniqueSeqs.size !== sequenceNumbers.length) {
        needsReorder = true
      }

      // Reorder if necessary
      if (needsReorder) {
        db.orders.sort((a: Order, b: Order) => a.createdAt.localeCompare(b.createdAt))
        db.orders.forEach((order: Order, idx: number) => {
          order.sequenceNumber = idx + 1
        })
        // Save the corrected database
        await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf-8')
      }
    }

    return db
  } catch {
    // File doesn't exist, create default
    await saveDatabase(DEFAULT_DB)
    return DEFAULT_DB
  }
}

async function saveDatabase(db: Database): Promise<void> {
  await ensureDirectories()

  // Create backup before saving
  try {
    await fs.access(DB_PATH)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(BACKUPS_DIR, `db_${timestamp}.json`)
    await fs.copyFile(DB_PATH, backupPath)

    // Keep only last 10 backups
    const backups = await fs.readdir(BACKUPS_DIR)
    const sortedBackups = backups
      .filter((f) => f.startsWith('db_') && f.endsWith('.json'))
      .sort()
      .reverse()

    for (const backup of sortedBackups.slice(10)) {
      await fs.unlink(path.join(BACKUPS_DIR, backup))
    }
  } catch {
    // No existing file to backup
  }

  db.lastModified = new Date().toISOString()
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf-8')
}

// ==================== Shop Operations ====================

export async function getAllShops(): Promise<Shop[]> {
  const db = await loadDatabase()
  return db.shops
}

export async function getShopById(id: string): Promise<Shop | undefined> {
  const db = await loadDatabase()
  return db.shops.find((s) => s.id === id)
}

export async function createShop(shop: Shop): Promise<Shop> {
  const db = await loadDatabase()
  db.shops.push(shop)
  await saveDatabase(db)
  return shop
}

export async function findOrCreateShop(name: string, id?: string): Promise<Shop> {
  const db = await loadDatabase()

  // If id is provided, check if shop with this id exists
  if (id) {
    let shop = db.shops.find((s) => s.id === id)
    if (shop) {
      // Shop exists, update name if different
      if (shop.name !== name) {
        shop.name = name
        await saveDatabase(db)
      }
      return shop
    }
  }

  // Check if shop with this name exists
  let shop = db.shops.find((s) => s.name === name)

  if (!shop) {
    // Create new shop
    shop = { id: id || '', name, createdAt: new Date().toISOString() }
    db.shops.push(shop)
    await saveDatabase(db)
  }

  return shop
}

// ==================== Product Operations ====================

export async function getAllProducts(): Promise<Product[]> {
  const db = await loadDatabase()
  return db.products
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const db = await loadDatabase()
  return db.products.find((p) => p.id === id)
}

export async function createProduct(product: Product): Promise<Product> {
  const db = await loadDatabase()
  db.products.push(product)
  await saveDatabase(db)
  return product
}

export async function findOrCreateProduct(
  name: string,
  id: string,
  imagePath: string,
  thumbnailPath: string
): Promise<Product> {
  const db = await loadDatabase()

  // Always create a new product for each upload
  const product: Product = {
    id,
    name,
    imagePath,
    thumbnailPath,
    createdAt: new Date().toISOString(),
  }

  db.products.push(product)
  await saveDatabase(db)
  return product
}

export async function searchProducts(
  type: 'productName' | 'shopName',
  keyword: string
): Promise<Product[]> {
  const db = await loadDatabase()
  const lowerKeyword = keyword.toLowerCase().trim()

  let matchingProducts: Product[] = []

  if (!lowerKeyword) {
    // Return all products that appear in any order items (purchased, gift, or smallGift)
    const usedProductIds = new Set<string>()
    for (const order of db.orders) {
      for (const item of order.items) {
        usedProductIds.add(item.productId)
      }
    }
    matchingProducts = db.products.filter((p) => usedProductIds.has(p.id))
  } else if (type === 'productName') {
    // Filter products that are used in orders and match name
    const usedProductIds = new Set<string>()
    for (const order of db.orders) {
      for (const item of order.items) {
        usedProductIds.add(item.productId)
      }
    }
    matchingProducts = db.products.filter(
      (p) =>
        usedProductIds.has(p.id) &&
        p.name.toLowerCase().includes(lowerKeyword)
    )
  } else {
    // Search by shop name
    const matchingShops = db.shops.filter((s) =>
      s.name.toLowerCase().includes(lowerKeyword)
    )
    const shopIds = new Set(matchingShops.map((s) => s.id))

    const productIds = new Set<string>()

    for (const order of db.orders) {
      // For regular orders, check order.shopId
      // For group orders, check item.shopId
      if (order.orderType === 'group') {
        // Check items in group orders
        for (const item of order.items) {
          if (item.shopId && shopIds.has(item.shopId)) {
            productIds.add(item.productId)
          }
        }
      } else {
        // Check regular orders
        if (shopIds.has(order.shopId)) {
          for (const item of order.items) {
            productIds.add(item.productId)
          }
        }
      }
    }

    matchingProducts = db.products.filter((p) => productIds.has(p.id))
  }

  // Deduplicate products by name - keep the most recent one for each unique name
  const productsByName = new Map<string, Product>()
  for (const product of matchingProducts) {
    const existing = productsByName.get(product.name)
    if (!existing || product.createdAt > existing.createdAt) {
      productsByName.set(product.name, product)
    }
  }

  return Array.from(productsByName.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
}

// ==================== Order Operations ====================

export async function getAllOrders(
  sortBy?: 'totalAmount' | 'giftTotal' | 'giftRatio',
  order?: 'asc' | 'desc'
): Promise<Order[]> {
  const db = await loadDatabase()
  let orders = [...db.orders]

  // Migrate old orders that don't have giftTotal field
  orders = orders.map(o => {
    const migrated: any = { ...o }

    // Add giftTotal if missing
    if (migrated.giftTotal === undefined) {
      migrated.giftTotal = 0
    }

    // Add orderType if missing (default to 'shop')
    if (!migrated.orderType) {
      migrated.orderType = 'shop'
    }

    return migrated
  })

  if (sortBy) {
    orders.sort((a, b) => {
      const aVal = a[sortBy]
      const bVal = b[sortBy]
      return order === 'desc' ? bVal - aVal : aVal - bVal
    })
  } else {
    // Default: sort by orderTime if available, then by sequence number
    orders.sort((a, b) => {
      // Orders with orderTime come first, sorted chronologically
      const aHasTime = !!a.orderTime
      const bHasTime = !!b.orderTime

      if (aHasTime && bHasTime) {
        // Both have orderTime, sort chronologically
        return new Date(a.orderTime).getTime() - new Date(b.orderTime).getTime()
      } else if (aHasTime) {
        // a has time, b doesn't - a comes first
        return -1
      } else if (bHasTime) {
        // b has time, a doesn't - b comes first
        return 1
      } else {
        // Neither has time, sort by sequence number (original entry order)
        return a.sequenceNumber - b.sequenceNumber
      }
    })
  }

  return orders
}

export async function getOrderById(id: string): Promise<Order | undefined> {
  const db = await loadDatabase()
  const order = db.orders.find((o) => o.id === id)

  // Migrate old orders to new schema
  if (order) {
    const migrated: any = { ...order }

    if (migrated.giftTotal === undefined) {
      migrated.giftTotal = 0
    }

    if (!migrated.orderType) {
      migrated.orderType = 'shop'
    }

    return migrated
  }

  return order
}

export async function createOrder(order: Omit<Order, 'sequenceNumber'>): Promise<Order> {
  const db = await loadDatabase()

  const newOrder: Order = {
    ...order,
    sequenceNumber: db.nextOrderSequence,
  }

  db.nextOrderSequence++
  db.orders.push(newOrder)
  await saveDatabase(db)

  return newOrder
}

export async function updateOrder(id: string, updates: Partial<Order>): Promise<Order | null> {
  const db = await loadDatabase()
  const index = db.orders.findIndex((o) => o.id === id)

  if (index === -1) return null

  db.orders[index] = { ...db.orders[index], ...updates }
  await saveDatabase(db)

  return db.orders[index]
}

export async function deleteOrder(id: string): Promise<boolean> {
  const db = await loadDatabase()
  const index = db.orders.findIndex((o) => o.id === id)

  if (index === -1) return false

  // Remove the order
  db.orders.splice(index, 1)

  // Reorder sequence numbers based on creation time
  // Sort by createdAt to maintain chronological order
  db.orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  // Reassign sequence numbers sequentially
  db.orders.forEach((order, idx) => {
    order.sequenceNumber = idx + 1
  })

  // Clean up orphaned shops and products
  // Find all shop IDs and product IDs still referenced by remaining orders
  const usedShopIds = new Set<string>()
  const usedProductIds = new Set<string>()

  for (const order of db.orders) {
    // Add main shop ID
    if (order.shopId) {
      usedShopIds.add(order.shopId)
    }
    // Add group order shop IDs
    if (order.shopIds) {
      order.shopIds.forEach(shopId => {
        if (shopId) usedShopIds.add(shopId)
      })
    }
    // Add product IDs from items
    order.items.forEach(item => {
      if (item.productId) {
        usedProductIds.add(item.productId)
      }
    })
  }

  // Remove orphaned shops (except the special "拼单" shop)
  db.shops = db.shops.filter(shop =>
    shop.name === '拼单' || usedShopIds.has(shop.id)
  )

  // Remove orphaned products
  db.products = db.products.filter(product =>
    usedProductIds.has(product.id)
  )

  await saveDatabase(db)

  return true
}

export { loadDatabase, DATA_DIR }
