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
          className="w-full aspect-[4/3] bg-gray-100 cursor-pointer overflow-hidden"
          onClick={() => setShowViewer(true)}
        >
          <img
            src={`/images/original/${product.imagePath}`}
            alt={product.name}
            className="w-full h-full object-cover hover:opacity-90 transition-opacity"
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
