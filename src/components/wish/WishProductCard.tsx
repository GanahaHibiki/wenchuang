import { useState } from 'react'
import type { WishProduct } from '@/api/client'
import ImageViewer from '../common/ImageViewer'

interface WishProductCardProps {
  product: WishProduct
  onDelete: () => void
}

export default function WishProductCard({ product, onDelete }: WishProductCardProps) {
  const [showViewer, setShowViewer] = useState(false)

  return (
    <>
      <div className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow relative group">
        <div
          className="w-full aspect-[4/3] bg-gray-100 cursor-pointer overflow-hidden"
          onClick={() => setShowViewer(true)}
        >
          <img
            src={`/images/original/${product.imagePath}`}
            alt={product.productName}
            className="w-full h-full object-cover hover:opacity-90 transition-opacity"
          />
        </div>
        <div className="p-3">
          <div className="text-xs text-gray-500 mb-1">{product.shopName}</div>
          <div className="text-sm font-medium text-gray-800 line-clamp-2">
            {product.productName}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs hover:bg-red-600"
          title="删除"
        >
          ×
        </button>
      </div>

      {showViewer && (
        <ImageViewer
          src={`/images/original/${product.imagePath}`}
          alt={product.productName}
          onClose={() => setShowViewer(false)}
        />
      )}
    </>
  )
}
