import type { Database, Order, Product, ProductReference } from '../../src/types/index.js'
import { allRelatedProductIds, buildProductAssociations, setArtist, setStyle } from './productAssociations.js'
import type { OrderArtistInput } from './productAssociations.js'

export type { ProductReference } from '../../src/types/index.js'
export type RelationsDatabase = Database
type Associations = ReturnType<typeof buildProductAssociations>
interface LogicalProduct {
  key: string
  reference: ProductReference
  ids: Set<string>
}

const normalizedShop = (name: string) => name.trim().toLowerCase()
const logicalKey = (shopName: string, name: string) => JSON.stringify([shopName, name.toLowerCase()])
const compareProducts = (a: Product, b: Product) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || a.id.localeCompare(b.id)

// Only order-referenced products with resolvable shops are eligible, including
// gifts/small gifts. Wishes and orphaned physical IDs never enter this index.
export function buildRelationIndex(db: RelationsDatabase, associations: Associations = buildProductAssociations(db)) {
  const byId = new Map<string, LogicalProduct>()
  const logical = new Map<string, LogicalProduct>()
  const shopByProduct = new Map<string, string>()
  for (const order of db.orders) {
    for (const item of order.items) {
      const shopId = order.orderType === 'group' ? item.shopId : order.shopId
      if (shopId && associations.shops.has(shopId) && !shopByProduct.has(item.productId)) {
        shopByProduct.set(item.productId, shopId)
      }
    }
  }
  for (const product of db.products.filter(product => shopByProduct.has(product.id)).sort(compareProducts)) {
    const shopId = shopByProduct.get(product.id)
    if (!shopId) continue
    // Match the existing same-shop/name history aggregation, even if legacy
    // data has several Shop IDs with the exact same display name.
    const key = logicalKey(associations.shops.get(shopId)!, product.name)
    let member = logical.get(key)
    if (!member) {
      member = { key, reference: { ...product, shopId, shopName: associations.shops.get(shopId)! }, ids: new Set() }
      logical.set(key, member)
    }
    member.ids.add(product.id)
    byId.set(product.id, member)
  }

  // Normalize equivalence groups in memory: expand historical IDs, discard
  // deleted/orphaned IDs and union overlapping old groups without writing reads.
  const parent = new Map<string, string>()
  const root = (key: string): string => {
    const next = parent.get(key)
    if (!next || next === key) return key
    const result = root(next)
    parent.set(key, result)
    return result
  }
  for (const link of db.productLinks || []) {
    const keys = (link.productIds || []).map(id => byId.get(id)?.key).filter((key): key is string => !!key)
    if (!keys.length) continue
    const first = root(keys[0])
    for (const key of keys) parent.set(root(key), first)
  }
  const sets = new Map<string, Set<string>>()
  for (const key of parent.keys()) {
    const groupRoot = root(key)
    if (!sets.has(groupRoot)) sets.set(groupRoot, new Set())
    sets.get(groupRoot)!.add(key)
  }
  const groups = [...sets.values()].filter(keys => keys.size > 1)
  const groupByKey = new Map<string, Set<string>>()
  for (const group of groups) for (const key of group) groupByKey.set(key, group)
  return { associations, byId, logical, groups, groupByKey }
}
export type RelationIndex = ReturnType<typeof buildRelationIndex>

export function relationMembers(index: RelationIndex, id: string): LogicalProduct[] {
  const source = index.byId.get(id)
  if (!source) return []
  const keys = index.groupByKey.get(source.key)
  if (!keys) return []
  // Stable member ordering gives deterministic card IDs and name/shop pairing.
  return [...keys].map(key => index.logical.get(key)!).sort((a, b) => a.reference.id.localeCompare(b.reference.id))
}

export function relationTargets(index: RelationIndex, id: string): ProductReference[] {
  const source = index.byId.get(id)
  return relationMembers(index, id)
    .filter(member => !source || normalizedShop(member.reference.shopName) !== normalizedShop(source.reference.shopName))
    .map(member => member.reference)
}

export function validateRelationSelection(index: RelationIndex, value: unknown, shop: { shopId?: string; shopName?: string }): string | undefined {
  if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || !id.trim())) {
    return '关联商品必须为商品ID数组'
  }
  const actualShopName = shop.shopId ? index.associations.shops.get(shop.shopId) : undefined
  const shopName = shop.shopName || actualShopName
  if (!shopName?.trim()) return '关联商品的源店铺不能为空'
  for (const id of value) {
    const target = index.byId.get(id)
    if (!target) return '只能关联其他店铺已被订单引用的商品'
    if (target.reference.shopId === shop.shopId || normalizedShop(target.reference.shopName) === normalizedShop(shopName) ||
      (actualShopName && normalizedShop(target.reference.shopName) === normalizedShop(actualShopName))) {
      return '不能关联同店铺商品'
    }
  }
}

export interface RelationOrderInput {
  relatedProductIds?: unknown
  shopId?: string
  shopName?: string
}
export function validateOrderRelations(db: RelationsDatabase, items: RelationOrderInput[]): string | undefined {
  const supplied = items.filter(item => Object.prototype.hasOwnProperty.call(item, 'relatedProductIds'))
  if (!supplied.length) return
  const index = buildRelationIndex(db)
  for (const item of supplied) {
    const error = validateRelationSelection(index, item.relatedProductIds, item)
    if (error) return error
  }
}

export function linkCandidates(index: RelationIndex, shopName: string, keyword: string, productId?: string): ProductReference[] {
  if (!shopName.trim()) return []
  const source = productId ? index.byId.get(productId) : undefined
  const sourceShop = source?.reference.shopName || shopName
  const lowerKeyword = keyword.toLowerCase().trim()
  const seen = new Set<string>()
  return [...index.logical.values()]
    .map(member => member.reference)
    .filter(product => {
      if (product.shopId === source?.reference.shopId || normalizedShop(product.shopName) === normalizedShop(sourceShop) ||
        !product.name.toLowerCase().includes(lowerKeyword)) return false
      // Match the ordinary search's case-insensitive shop/name dedup, even
      // when legacy data contains multiple Shop IDs with the same display name.
      const key = JSON.stringify([normalizedShop(product.shopName), product.name.toLowerCase()])
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 50)
}

function persistGroups(db: RelationsDatabase, index: RelationIndex, groups: Set<string>[]): void {
  const links = groups.filter(group => group.size > 1).map(group => {
    const productIds = [...group].flatMap(key => [...(index.logical.get(key)?.ids || [])]).sort()
    return { id: `link:${productIds[0]}`, productIds }
  }).filter(link => link.productIds.length > 1)
  if (links.length || db.productLinks !== undefined) db.productLinks = links
}

export function cleanProductLinks(db: RelationsDatabase): void {
  if (!db.productLinks?.length) return
  const index = buildRelationIndex(db)
  persistGroups(db, index, index.groups)
}

function replaceGroup(groups: Set<string>[], sourceKey: string, targetKeys: string[]): Set<string>[] {
  // Detach just the source; its former peers remain an equivalence group.
  const remaining = groups.map(group => new Set([...group].filter(key => key !== sourceKey)))
    .filter(group => group.size > 1)
  if (!targetKeys.length) return remaining
  const merged = new Set([sourceKey, ...targetKeys])
  let changed = true
  while (changed) {
    changed = false
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (![...remaining[i]].some(key => merged.has(key))) continue
      for (const key of remaining[i]) merged.add(key)
      remaining.splice(i, 1)
      changed = true
    }
  }
  remaining.push(merged)
  return remaining
}

export function setProductRelations(db: RelationsDatabase, id: string, productIds: string[]): ProductReference[] {
  const index = buildRelationIndex(db)
  const source = index.byId.get(id)
  if (!source) return []
  const groups = replaceGroup(index.groups, source.key, productIds.map(target => index.byId.get(target)!.key))
  persistGroups(db, index, groups)
  const product = index.associations.products.get(id)!
  for (const relatedId of allRelatedProductIds(index.associations, db, id)) {
    const related = index.associations.products.get(relatedId)
    if (!related) continue
    setArtist(related, product.artist)
    setStyle(related, product.style)
  }
  return relationTargets(buildRelationIndex(db), id)
}

// Resolve final membership before metadata propagation. Old + pending orders
// let replacements inherit before their predecessor loses its last reference.
export function applyOrderRelations(db: RelationsDatabase, order: Order, inputs: OrderArtistInput[]): void {
  const snapshot = { ...db, orders: [...db.orders, order] }
  if (!inputs.length || (!db.productLinks?.length && !inputs.some(input => input.relatedProductIds?.length))) return
  const index = buildRelationIndex(snapshot)
  let groups = index.groups.map(group => new Set(group))
  const explicit = new Map<string, string[]>()
  for (const input of inputs) {
    const source = index.byId.get(input.productId)
    if (!source) continue
    if (Object.prototype.hasOwnProperty.call(input, 'relatedProductIds')) {
      explicit.set(source.key, input.relatedProductIds || [])
      continue
    }
    const previous = input.sourceProductId ? index.byId.get(input.sourceProductId) : undefined
    if (!previous || previous.key === source.key || previous.reference.shopName !== source.reference.shopName) continue
    const inherited = groups.find(group => group.has(previous.key))
    if (inherited) inherited.add(source.key)
  }
  // Explicit values override inheritance; the last submitted value wins for a
  // same-shop/name logical product, independently of omitted duplicate items.
  for (const [key, ids] of explicit) {
    groups = replaceGroup(groups, key, ids.map(id => index.byId.get(id)?.key).filter((value): value is string => !!value))
  }
  persistGroups(db, index, groups)
}
