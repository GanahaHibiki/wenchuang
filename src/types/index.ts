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
export const MULTI_ENTRY_TYPES: SpecificationType[] = ['卡头', '封口贴', '长贴']

export interface Specification {
  type: SpecificationType
  customType?: string // Custom type name when type is '其他衍生'
  sequenceNumber: number // 1, 2, 3... for multi-entry types
  quantity: number
  purchasePrice?: number // Only for purchased items
  originalPrice: number
}

export type ItemCategory = 'purchased' | 'gift' | 'smallGift'

export type GiftType = '满赠礼' | '宣传礼' | '手速礼' | '高消礼' | '小时礼' | '新客礼' | '回购礼'

export const GIFT_TYPES: GiftType[] = ['满赠礼', '宣传礼', '手速礼', '高消礼', '小时礼', '新客礼', '回购礼']

export interface OrderItem {
  id: string
  productId: string
  category: ItemCategory
  giftType?: GiftType
  specifications: Specification[]
}

export interface Order {
  id: string
  sequenceNumber: number
  shopId: string
  items: OrderItem[]
  totalAmount: number
  giftTotal: number
  smallGiftTotal: number
  giftRatio: number
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
  shop: Shop
  purchasedItems: (OrderItem & { product: Product })[]
  gifts: (OrderItem & { product: Product })[]
  smallGifts: (OrderItem & { product: Product })[]
}

export interface OrderSummary {
  id: string
  sequenceNumber: number
  shopName: string
  totalAmount: number
  giftTotal: number
  smallGiftTotal: number
  giftRatio: number
}

// ==================== Database Schema ====================

export interface Database {
  version: string
  lastModified: string
  nextOrderSequence: number
  shops: Shop[]
  products: Product[]
  orders: Order[]
}
