import { useState, useEffect } from 'react'
import { wishApi, type WishProduct } from '@/api/client'
import ImageViewer from '../common/ImageViewer'

interface WishProductCardProps {
  product: WishProduct
  onDelete: () => void
  onUpdate: () => void
}

export default function WishProductCard({ product, onDelete, onUpdate }: WishProductCardProps) {
  const [showViewer, setShowViewer] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editProductName, setEditProductName] = useState(product.productName)
  const [editShopName, setEditShopName] = useState(product.shopName)
  const [isSaving, setIsSaving] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  useEffect(() => {
    if (!isEditing) {
      setEditProductName(product.productName)
      setEditShopName(product.shopName)
    }
  }, [product.productName, product.shopName, isEditing])

  const handleSave = async () => {
    if (!editProductName.trim() || !editShopName.trim()) {
      alert('商品名和店铺名不能为空')
      return
    }

    setIsSaving(true)
    try {
      await wishApi.update(product.id, {
        productName: editProductName.trim(),
        shopName: editShopName.trim(),
      })
      setIsEditing(false)
      onUpdate()
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setEditProductName(product.productName)
    setEditShopName(product.shopName)
    setIsEditing(false)
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow relative group">
        <div
          className="w-full aspect-[4/3] bg-gray-200 cursor-pointer overflow-hidden"
          onClick={() => setShowViewer(true)}
        >
          <img
            src={`/images/thumbnails/${product.thumbnailPath}`}
            alt={product.productName}
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
            className={`w-full h-full object-cover hover:opacity-90 transition-all duration-300 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </div>
        <div className="p-3">
          {isEditing ? (
            <div className="space-y-2">
              <input
                type="text"
                value={editShopName}
                onChange={(e) => setEditShopName(e.target.value)}
                placeholder="店铺名"
                className="w-full px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <input
                type="text"
                value={editProductName}
                onChange={(e) => setEditProductName(e.target.value)}
                placeholder="商品名"
                className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                >
                  {isSaving ? '保存中...' : '保存'}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="flex-1 px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-xs text-gray-500 mb-1">{product.shopName}</div>
              <div className="text-sm font-medium text-gray-800 line-clamp-2">
                {product.productName}
              </div>
            </>
          )}
        </div>
        {!isEditing && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsEditing(true)
              }}
              className="absolute top-2 left-2 w-6 h-6 bg-blue-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs hover:bg-blue-600"
              title="编辑"
            >
              ✎
            </button>
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
          </>
        )}
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
