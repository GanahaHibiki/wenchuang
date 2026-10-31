import type { Product, ProductStyle } from '@/types'
import type { ProductWithShop } from '@/api/client'
import ProductCard from './ProductCard'

interface ProductGridProps {
  products: (Product | ProductWithShop)[]
  emptyMessage?: string
  styleFilter?: ProductStyle
}

export default function ProductGrid({ products, emptyMessage = '暂无商品', styleFilter }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          styleFilter={styleFilter}
          shopName={'shopName' in product ? product.shopName : undefined}
        />
      ))}
    </div>
  )
}
