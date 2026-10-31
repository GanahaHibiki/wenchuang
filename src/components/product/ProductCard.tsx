import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Product, ProductReference, ProductStyle } from '@/types'
import ImageViewer from '../common/ImageViewer'

interface ProductCardProps {
  product: Product & { linkedProducts?: ProductReference[] }
  shopName?: string
  styleFilter?: ProductStyle
}

export default function ProductCard({ product, shopName, styleFilter }: ProductCardProps) {
  const [showViewer, setShowViewer] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const styleQuery = styleFilter ? `&style=${encodeURIComponent(styleFilter)}` : ''
  const members = product.linkedProducts?.length ? product.linkedProducts : [{ ...product, shopName: shopName || '', shopId: '' }]
  const grouped = members.length > 1
  const artists = [...new Set(members.map(member => member.artist).filter((artist): artist is string => Boolean(artist)))]

  return (
    <>
      <div data-product-card={product.id} className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow">
        <div className="w-full aspect-[4/3] bg-gray-200 cursor-pointer overflow-hidden" onClick={() => setShowViewer(true)}>
          <img src={`/images/thumbnails/${product.thumbnailPath}`} alt={product.name} loading="lazy" decoding="async"
            onLoad={() => setImageLoaded(true)}
            className={`w-full h-full object-cover hover:opacity-90 transition-all duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`} />
        </div>
        <div className="p-3">
          {grouped ? (
            <div className="text-sm font-medium break-words">
              {members.map((member, index) => (
                <Fragment key={member.id}>
                  {index > 0 && ' / '}
                  <Link to={`/products/${member.id}`} title={`${member.name}（${member.shopName}）`} className="text-gray-800 hover:text-blue-600">{member.name}</Link>
                </Fragment>
              ))}
            </div>
          ) : (
            <Link to={`/products/${product.id}`} className="text-sm font-medium text-gray-800 hover:text-blue-600 line-clamp-2">{product.name}</Link>
          )}
          {grouped ? (
            <p className="text-xs text-gray-500 mt-1 break-words">
              {members.map((member, index) => (
                <Fragment key={member.id}>
                  {index > 0 && ' / '}
                  <Link to={`/?type=shopName&keyword=${encodeURIComponent(member.shopName)}&exact=true${styleQuery}`} className="hover:text-blue-600 hover:underline">{member.shopName}</Link>
                </Fragment>
              ))}
            </p>
          ) : shopName && (
            <Link to={`/?type=shopName&keyword=${encodeURIComponent(shopName)}&exact=true${styleQuery}`} className="block text-xs text-gray-500 mt-1 truncate hover:text-blue-600 hover:underline">{shopName}</Link>
          )}
          {artists.length > 0 && (
            <p className="text-xs text-gray-500 mt-1 break-words">
              美工：{artists.map((artist, index) => (
                <Fragment key={artist}>
                  {index > 0 && ' / '}
                  <Link to={`/?type=artist&keyword=${encodeURIComponent(artist)}&exact=true${styleQuery}`} className="hover:text-blue-600 hover:underline">{artist}</Link>
                </Fragment>
              ))}
            </p>
          )}
        </div>
      </div>
      {showViewer && <ImageViewer src={`/images/original/${product.imagePath}`} alt={product.name} onClose={() => setShowViewer(false)} />}
    </>
  )
}
