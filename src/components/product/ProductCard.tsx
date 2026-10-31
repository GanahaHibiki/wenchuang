import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Product } from '@/types'
import ImageViewer from '../common/ImageViewer'

interface ProductCardProps {
  product: Product
  shopName?: string
}

export default function ProductCard({ product, shopName }: ProductCardProps) {
  const [showViewer, setShowViewer] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  return (
    <>
      <div className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow">
        <div
          className="w-full aspect-[4/3] bg-gray-200 cursor-pointer overflow-hidden"
          onClick={() => setShowViewer(true)}
        >
          <img
            src={`/images/thumbnails/${product.thumbnailPath}`}
            alt={product.name}
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
            className={`w-full h-full object-cover hover:opacity-90 transition-all duration-300 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </div>
        <div className="p-3">
          <Link
            to={`/products/${product.id}`}
            className="text-sm font-medium text-gray-800 hover:text-blue-600 line-clamp-2"
          >
            {product.name}
          </Link>
          {shopName && (
            <Link
              to={`/?type=shopName&keyword=${encodeURIComponent(shopName)}&exact=true`}
              className="block text-xs text-gray-500 mt-1 truncate hover:text-blue-600 hover:underline"
            >
              {shopName}
            </Link>
          )}
          {product.artist && (
            <p className="text-xs text-gray-500 mt-1 truncate">
              美工：<Link
                to={`/?type=artist&keyword=${encodeURIComponent(product.artist)}&exact=true`}
                className="hover:text-blue-600 hover:underline"
              >{product.artist}</Link>
            </p>
          )}
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
