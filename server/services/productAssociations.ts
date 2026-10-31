import type { Database, Order, Product, ProductStyle } from '../../src/types/index.js'
import { PRODUCT_STYLES } from '../../src/types/index.js'

// All indexes are scoped to a single database snapshot, never cached across requests.
export function productGroupKey(shopName: string, productName: string): string {
  return JSON.stringify([shopName, productName.toLowerCase()])
}

export function buildProductAssociations(db: Database) {
  const products = new Map(db.products.map(product => [product.id, product]))
  const shops = new Map(db.shops.map(shop => [shop.id, shop.name]))
  const searchShopNames = new Map<string, string>()
  const detailShopNames = new Map<string, string | null>()
  const groups = new Map<string, Set<string>>()

  for (const order of db.orders) {
    const seenInOrder = new Set<string>()
    for (const item of order.items) {
      const shopId = order.orderType === 'group' ? item.shopId : order.shopId
      const shopName = shopId ? shops.get(shopId) || null : null
      if (!searchShopNames.has(item.productId)) {
        searchShopNames.set(item.productId, shopName || '未知店铺')
      }
      // Detail historically skips an unresolved first shop and tries the next order,
      // but only considers the first occurrence of this Product ID within each order.
      if (!seenInOrder.has(item.productId) && !detailShopNames.get(item.productId)) {
        detailShopNames.set(item.productId, shopName)
      }
      seenInOrder.add(item.productId)

      const product = products.get(item.productId)
      if (!product || !shopName) continue
      const key = productGroupKey(shopName, product.name)
      let ids = groups.get(key)
      if (!ids) {
        ids = new Set<string>()
        groups.set(key, ids)
      }
      ids.add(product.id)
    }
  }

  return { products, shops, searchShopNames, detailShopNames, groups }
}

export function relatedProductIds(index: ReturnType<typeof buildProductAssociations>, id: string): Set<string> {
  const product = index.products.get(id)
  const shopName = index.detailShopNames.get(id)
  const ids = new Set<string>([id])
  if (product && shopName) {
    for (const relatedId of index.groups.get(productGroupKey(shopName, product.name)) || []) {
      ids.add(relatedId)
    }
  }
  return ids
}

// Omitted artist is distinct from a provided empty string (which clears it).
export function isValidArtist(value: unknown): value is string {
  return typeof value === 'string'
}

export function hasInvalidArtists(items: Array<{ artist?: unknown }>): boolean {
  return items.some(item => Object.prototype.hasOwnProperty.call(item, 'artist') && !isValidArtist(item.artist))
}

export function setArtist(product: Product, artist: string | undefined): void {
  const name = artist?.trim()
  if (name) product.artist = name
  else delete product.artist
}

export function isValidProductStyle(value: unknown): value is ProductStyle {
  return typeof value === 'string' && PRODUCT_STYLES.includes(value as ProductStyle)
}

export function isValidStyle(value: unknown): value is ProductStyle | '' {
  return value === '' || isValidProductStyle(value)
}

export function hasInvalidStyles(items: Array<{ style?: unknown }>): boolean {
  return items.some(item => Object.prototype.hasOwnProperty.call(item, 'style') && !isValidStyle(item.style))
}

export function setStyle(product: Product, style: ProductStyle | '' | undefined): void {
  if (style) product.style = style
  else delete product.style
}

export interface OrderArtistInput {
  productId: string
  artist?: string
  style?: ProductStyle | ''
  // Preserve selected product information when editing creates a replacement ID.
  sourceProductId?: string
  shopId?: string
}

export function orderArtistInput(productId: string, item: { artist?: string; style?: ProductStyle | ''; productId?: string; shopId?: string }): OrderArtistInput {
  return {
    productId,
    sourceProductId: item.productId,
    shopId: item.shopId,
    ...(Object.prototype.hasOwnProperty.call(item, 'artist') ? { artist: item.artist } : {}),
    ...(Object.prototype.hasOwnProperty.call(item, 'style') ? { style: item.style } : {}),
  }
}

// Called inside the final order save. Include both the old associations and the
// pending items so replacements inherit even when the old ID loses its last order.
// Newly created IDs in this request are connected before inheritance as well.
// The legacy helper name/export also handles style, independently of artist,
// using the same request-local association index and final save.
export function applyOrderArtists(db: Database, order: Order, inputs: OrderArtistInput[]): void {
  if (!inputs.length) return
  const index = buildProductAssociations({ ...db, orders: [...db.orders, order] })
  const groupArtists = new Map<string, string>()
  const groupStyles = new Map<string, ProductStyle>()
  for (const [key, ids] of index.groups) {
    for (const id of ids) {
      const product = index.products.get(id)
      const artist = product?.artist?.trim()
      if (artist && !groupArtists.has(key)) groupArtists.set(key, artist)
      if (isValidProductStyle(product?.style) && !groupStyles.has(key)) groupStyles.set(key, product.style)
    }
  }

  const pending = new Map<string, {
    ids: Set<string>
    artist: string | undefined
    explicit: boolean
    style: ProductStyle | undefined
    styleExplicit: boolean
  }>()
  for (const input of inputs) {
    const product = index.products.get(input.productId)
    if (!product) continue
    const shopId = order.orderType === 'group' ? input.shopId : order.shopId
    const shopName = shopId ? index.shops.get(shopId) : undefined
    const key = shopName ? productGroupKey(shopName, product.name) : JSON.stringify([null, product.id])
    let update = pending.get(key)
    if (!update) {
      update = {
        ids: new Set(index.groups.get(key) || [product.id]),
        artist: groupArtists.get(key) || product.artist?.trim(),
        explicit: false,
        style: groupStyles.get(key) || (isValidProductStyle(product.style) ? product.style : undefined),
        styleExplicit: false,
      }
      pending.set(key, update)
    }
    update.ids.add(product.id)
    if (Object.prototype.hasOwnProperty.call(input, 'artist')) {
      // Conflicting explicit values within one group: the last submitted value wins.
      update.artist = input.artist?.trim() || undefined
      update.explicit = true
    } else if (!update.explicit && !update.artist && input.sourceProductId) {
      update.artist = index.products.get(input.sourceProductId)?.artist?.trim() || undefined
    }
    if (Object.prototype.hasOwnProperty.call(input, 'style')) {
      update.style = input.style || undefined
      update.styleExplicit = true
    } else if (!update.styleExplicit && !update.style && input.sourceProductId) {
      const sourceStyle = index.products.get(input.sourceProductId)?.style
      if (isValidProductStyle(sourceStyle)) update.style = sourceStyle
    }
  }
  for (const update of pending.values()) {
    for (const id of update.ids) {
      const product = index.products.get(id)
      if (product) {
        setArtist(product, update.artist)
        setStyle(product, update.style)
      }
    }
  }
}
