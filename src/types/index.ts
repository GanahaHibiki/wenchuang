// ==================== Core Types ====================

export interface Shop {
  id: string
  name: string
  createdAt: string
}

export interface Product {
  id: string
  name: string
  imagePath: string
  thumbnailPath: string
  createdAt: string
}

export type SpecificationType =
  | '试吃set'
  | '小食量set'
  | '大食量set'
  | '折页'
  | '异形折页'
  | '卡背'
  | '卡头'
  | '封口贴'
  | '长贴'
  | '其他贴纸'
  | '贴纸包'
  | '吊牌'
  | '封箱贴'
  | '售后卡'
  | '豆丁贴'
  | 'gift贴'
  | '磨砂盒'
  | '其他衍生'

export const SPECIFICATION_TYPES: SpecificationType[] = [
  '试吃set',
  '小食量set',
  '大食量set',
  '折页',
  '异形折页',
  '卡背',
  '卡头',
  '封口贴',
  '长贴',
  '其他贴纸',
  '贴纸包',
  '吊牌',
  '封箱贴',
  '售后卡',
  '豆丁贴',
  'gift贴',
  '磨砂盒',
  '其他衍生',
]

// Display order for specifications (different from input order)
export const SPECIFICATION_DISPLAY_ORDER: SpecificationType[] = [
  '大食量set',
  '小食量set',
  '试吃set',
  '折页',
  '异形折页',
  '卡背',
  '卡头',
  '封口贴',
  '长贴',
  '其他贴纸',
  '贴纸包',
  '吊牌',
  '封箱贴',
  '售后卡',
  '豆丁贴',
  'gift贴',
  '磨砂盒',
  '其他衍生',
]

// Types that support multiple entries
export const MULTI_ENTRY_TYPES: SpecificationType[] = ['卡头', '封口贴', '长贴', '其他贴纸', '其他衍生']

export interface Specification {
  type: SpecificationType
  customType?: string // Custom type name when type is '其他衍生'
  sequenceNumber: number // 1, 2, 3... for multi-entry types
  quantity: number
  purchasePrice?: number // Only for purchased items
  originalPrice: number
}

export type ItemCategory = 'purchased' | 'gift' | 'smallGift'

export type GiftType = '满赠礼' | '宣传礼' | '手速礼' | '高消礼' | '小时礼' | '新客礼' | '回购礼' | '其他'

export const GIFT_TYPES: GiftType[] = ['满赠礼', '宣传礼', '手速礼', '高消礼', '小时礼', '新客礼', '回购礼', '其他']

export type OrderType = 'shop' | 'group'

export interface OrderItem {
  id: string
  productId: string
  category: ItemCategory
  giftType?: GiftType
  customGiftType?: string // Custom gift type name when giftType is '其他'
  specifications: Specification[]
  shopId?: string // For group orders, track which shop this item belongs to
}

export type DeliveryStatus = '未到货' | '已到货'

export interface Order {
  id: string
  sequenceNumber: number
  orderType: OrderType
  shopId: string // For group orders, this can be a special "GROUP" id
  shopIds?: string[] // For group orders, list of all shop IDs
  items: OrderItem[]
  totalAmount: number
  giftTotal: number
  smallGiftTotal: number
  giftRatio: number
  note?: string // User note for this order
  deliveryStatus?: DeliveryStatus // Delivery status, defaults to '未到货'
  orderTime?: string // Order time in ISO format (precision to seconds)
  shippingTime?: string // Shipping time in ISO format (precision to day)
  createdAt: string
}

// ==================== API Request/Response Types ====================

export interface CreateShopRequest {
  name: string
}

export interface CreateProductRequest {
  name: string
  image: File
}

export interface CreateOrderRequest {
  shopName: string
  purchasedItems: {
    productName: string
    image: File
    specifications: Specification[]
  }[]
  gifts: {
    giftType: GiftType
    productName: string
    image: File
    specifications: Omit<Specification, 'purchasePrice'>[]
  }[]
  smallGifts: {
    productName: string
    image: File
    specifications: Omit<Specification, 'purchasePrice'>[]
  }[]
}

export interface ProductDetail extends Product {
  entries: {
    purchased: ProductEntry[]
    gifts: (ProductEntry & { giftType: GiftType })[]
    smallGifts: ProductEntry[]
  }
}

export interface ProductEntry {
  orderId: string
  orderSequence: number
  shopName: string
  specifications: Specification[]
}

export interface OrderDetail extends Omit<Order, 'items'> {
  shop: Shop | null // null for group orders
  shops?: Shop[] // For group orders, all shops involved
  purchasedItems: (OrderItem & { product: Product })[]
  gifts: (OrderItem & { product: Product })[]
  smallGifts: (OrderItem & { product: Product })[]
}

export interface OrderSummary {
  id: string
  sequenceNumber: number
  orderType: OrderType
  shopName: string
  totalAmount: number
  giftTotal: number
  smallGiftTotal: number
  giftRatio: number
  note?: string
  deliveryStatus?: DeliveryStatus
  orderTime?: string
  shippingTime?: string
}

// ==================== Database Schema ====================

export interface WishItem {
  id: string
  shopId: string
  productId: string
  productName: string
  imagePath: string
  thumbnailPath: string
  createdAt: string
}

export interface Database {
  version: string
  lastModified: string
  nextOrderSequence: number
  shops: Shop[]
  products: Product[]
  orders: Order[]
  wishItems?: WishItem[]
}
