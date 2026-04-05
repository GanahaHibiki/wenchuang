import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Product } from '@/types'
import ImageViewer from '../common/ImageViewer'

interface ProductCardProps {
  product: Product
}

export default function ProductCard({ product }: ProductCardProps) {
  const [showViewer, setShowViewer] = useState(false)

  return (
    <>
      <div className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow">
        <div
          className="w-[640px] h-[480px] bg-gray-100 cursor-pointer relative"
          onClick={() => setShowViewer(true)}
        >
          <img
            src={`/images/original/${product.imagePath}`}
            alt={product.name}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-full max-h-full object-contain hover:opacity-90 transition-opacity"
          />
        </div>
        <div className="p-3">
          <Link
            to={`/products/${product.id}`}
            className="text-sm font-medium text-gray-800 hover:text-blue-600 line-clamp-2"
          >
            {product.name}
          </Link>
        </div>
      </div>

      {showViewer && (
        <ImageViewer
          src={`/images/original/${product.imagePath}`}
          alt={product.name}
          onClose={() => setShowViewer(false)}
        />
      )}
    </>
  )
}
