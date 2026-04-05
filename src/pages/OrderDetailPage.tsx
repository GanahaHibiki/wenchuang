import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { orderApi } from '@/api/client'
import type { OrderDetail, OrderItem, Product } from '@/types'
import ImageViewer from '@/components/common/ImageViewer'
import OrderItemEditor from '@/components/order/OrderItemEditor'

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewingImage, setViewingImage] = useState<string | null>(null)
  const [editingCategory, setEditingCategory] = useState<'purchased' | 'gift' | 'smallGift' | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isEditingShopName, setIsEditingShopName] = useState(false)
  const [editedShopName, setEditedShopName] = useState('')

  useEffect(() => {
    if (!id) return

    const loadOrder = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const data = await orderApi.getDetail(id)
        setOrder(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败')
      } finally {
        setIsLoading(false)
      }
    }

    loadOrder()
  }, [id])

  const handleSaveItems = async (
    category: 'purchased' | 'gift' | 'smallGift',
    updatedItems: (OrderItem & { product: Product })[],
    newImages: Map<string, File>
  ) => {
    if (!order || !id) return

    setIsSaving(true)
    try {
      // Prepare FormData
      const formData = new FormData()

      // Prepare items data based on category
      const purchased = category === 'purchased' ? updatedItems : order.purchasedItems
      const gifts = category === 'gift' ? updatedItems : order.gifts
      const smallGifts = category === 'smallGift' ? updatedItems : order.smallGifts

      // Convert to the format expected by the API
      const purchasedData = purchased.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        specifications: item.specifications,
      }))

      const giftsData = gifts.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        giftType: item.giftType,
        specifications: item.specifications,
      }))

      const smallGiftsData = smallGifts.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        specifications: item.specifications,
      }))

      formData.append('purchasedItems', JSON.stringify(purchasedData))
      formData.append('gifts', JSON.stringify(giftsData))
      formData.append('smallGifts', JSON.stringify(smallGiftsData))

      // Add images for updated items
      let imageIndex = 0
      for (const [itemId, file] of newImages.entries()) {
        const itemList = category === 'purchased' ? purchased : category === 'gift' ? gifts : smallGifts
        const itemIndex = itemList.findIndex(item => item.id === itemId)
        if (itemIndex !== -1) {
          const fieldName = category === 'purchased'
            ? `purchasedImage_${itemIndex}`
            : category === 'gift'
            ? `giftImage_${itemIndex}`
            : `smallGiftImage_${itemIndex}`
          formData.append(fieldName, file)
        }
      }

      await orderApi.update(id, formData)

      // Reload order data
      const refreshedOrder = await orderApi.getDetail(id)
      setOrder(refreshedOrder)
      setEditingCategory(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveShopName = async () => {
    if (!order || !id || !editedShopName.trim()) return

    setIsSaving(true)
    try {
      const formData = new FormData()
      formData.append('shopName', editedShopName.trim())

      // Keep existing items
      const purchasedData = order.purchasedItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        specifications: item.specifications,
      }))

      const giftsData = order.gifts.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        giftType: item.giftType,
        specifications: item.specifications,
      }))

      const smallGiftsData = order.smallGifts.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        specifications: item.specifications,
      }))

      formData.append('purchasedItems', JSON.stringify(purchasedData))
      formData.append('gifts', JSON.stringify(giftsData))
      formData.append('smallGifts', JSON.stringify(smallGiftsData))

      await orderApi.update(id, formData)

      // Reload order data
      const refreshedOrder = await orderApi.getDetail(id)
      setOrder(refreshedOrder)
      setIsEditingShopName(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteOrder = async () => {
    if (!id) return

    const confirmed = window.confirm('确定要删除这个订单吗？此操作无法撤销。')
    if (!confirmed) return

    setIsDeleting(true)
    try {
      await orderApi.delete(id)
      alert('订单已删除')
      navigate('/orders')
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败')
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">加载中...</div>
  }

  if (error || !order) {
    return <div className="text-center py-12 text-red-500">{error || '订单不存在'}</div>
  }

  // Helper function to display specification type with custom name
  const getSpecTypeName = (spec: { type: string; customType?: string }) => {
    if (spec.type === '其他衍生' && spec.customType) {
      return spec.customType
    }
    return spec.type
  }

  const renderItem = (item: OrderItem & { product: Product }, showPurchasePrice: boolean) => {
    // Check which spec types have multiple entries
    const specTypeCounts = new Map<string, number>()
    item.specifications.forEach(spec => {
      const typeName = getSpecTypeName(spec)
      specTypeCounts.set(typeName, (specTypeCounts.get(typeName) || 0) + 1)
    })

    return (
      <div key={item.id} className="bg-gray-50 rounded-lg p-3 flex flex-col">
        <div
          className="w-full aspect-[4/3] bg-gray-200 rounded overflow-hidden cursor-pointer mb-2"
          onClick={() => setViewingImage(`/images/original/${item.product.imagePath}`)}
        >
          <img
            src={`/images/original/${item.product.imagePath}`}
            alt={item.product.name}
            className="w-full h-full object-cover"
          />
        </div>
        <Link
          to={`/products/${item.product.id}`}
          className="font-medium text-blue-600 hover:underline text-sm mb-2 line-clamp-2"
        >
          {item.product.name}
        </Link>
        <div className="space-y-1">
          {item.specifications.map((spec, index) => {
            const typeName = getSpecTypeName(spec)
            const hasMultiple = (specTypeCounts.get(typeName) || 0) > 1

            return (
              <div key={index} className="text-xs text-gray-600">
                {typeName}
                {hasMultiple && spec.sequenceNumber}:
                {' '}{spec.quantity} 个
                {showPurchasePrice && spec.purchasePrice !== undefined && (
                  <> × ¥{spec.purchasePrice.toFixed(2)} = ¥{(spec.quantity * spec.purchasePrice).toFixed(2)}</>
                )}
                {!showPurchasePrice && (
                  <> × ¥{spec.originalPrice.toFixed(2)} = ¥{(spec.quantity * spec.originalPrice).toFixed(2)}</>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Group gifts by type
  const giftsByType = order.gifts.reduce((acc, gift) => {
    const type = gift.giftType || '其他'
    if (!acc[type]) acc[type] = []
    acc[type].push(gift)
    return acc
  }, {} as Record<string, typeof order.gifts>)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">
            订单 #{order.sequenceNumber} -
          </h1>
          {isEditingShopName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editedShopName}
                onChange={(e) => setEditedShopName(e.target.value)}
                className="px-3 py-1 border rounded-md text-xl font-bold"
                autoFocus
              />
              <button
                onClick={handleSaveShopName}
                disabled={isSaving || !editedShopName.trim()}
                className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
              >
                保存
              </button>
              <button
                onClick={() => {
                  setIsEditingShopName(false)
                  setEditedShopName(order.shop.name)
                }}
                className="px-3 py-1 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 text-sm"
              >
                取消
              </button>
            </div>
          ) : (
            <>
              <span className="text-2xl font-bold">{order.shop.name}</span>
              <button
                onClick={() => {
                  setIsEditingShopName(true)
                  setEditedShopName(order.shop.name)
                }}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                编辑
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDeleteOrder}
            disabled={isDeleting}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? '删除中...' : '删除订单'}
          </button>
          <Link
            to="/orders"
            className="text-blue-500 hover:underline"
          >
            返回列表
          </Link>
        </div>
      </div>

      {/* Summary */}
      <section className="bg-blue-50 rounded-lg p-6">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-sm text-gray-600">订单金额</div>
            <div className="text-xl font-bold text-blue-600">
              ¥{order.totalAmount.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">小礼物总价</div>
            <div className="text-xl font-bold text-green-600">
              ¥{order.smallGiftTotal.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">小礼物占比</div>
            <div className="text-xl font-bold text-purple-600">
              {order.totalAmount > 0 ? `${order.giftRatio.toFixed(1)}%` : '-'}
            </div>
          </div>
        </div>
      </section>

      {/* Purchased Items */}
      <section className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">已购商品</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{order.purchasedItems.length} 件</span>
            <button
              onClick={() => setEditingCategory('purchased')}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              编辑
            </button>
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,215px))] gap-4 justify-center">
          {order.purchasedItems.length === 0 ? (
            <p className="text-gray-500 col-span-full">暂无已购商品</p>
          ) : (
            order.purchasedItems.map((item) => renderItem(item, true))
          )}
        </div>
      </section>

      {/* Gifts */}
      <section className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">礼品</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{order.gifts.length} 件</span>
            <button
              onClick={() => setEditingCategory('gift')}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              编辑
            </button>
          </div>
        </div>
        {order.gifts.length === 0 ? (
          <p className="text-gray-500">暂无礼品</p>
        ) : (
          <div className="space-y-6">
            {Object.entries(giftsByType).map(([type, gifts]) => (
              <div key={type}>
                <h3 className="text-md font-medium text-gray-700 mb-2">[{type}]</h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,215px))] gap-4 justify-center">
                  {gifts.map((item) => renderItem(item, false))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Small Gifts */}
      <section className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">小礼物</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{order.smallGifts.length} 件</span>
            <button
              onClick={() => setEditingCategory('smallGift')}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              编辑
            </button>
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,215px))] gap-4 justify-center">
          {order.smallGifts.length === 0 ? (
            <p className="text-gray-500 col-span-full">暂无小礼物</p>
          ) : (
            order.smallGifts.map((item) => renderItem(item, false))
          )}
        </div>
      </section>

      {/* Image Viewer */}
      {viewingImage && (
        <ImageViewer
          src={viewingImage}
          onClose={() => setViewingImage(null)}
        />
      )}

      {/* Order Item Editor */}
      {editingCategory && order && (
        <OrderItemEditor
          items={
            editingCategory === 'purchased'
              ? order.purchasedItems
              : editingCategory === 'gift'
              ? order.gifts
              : order.smallGifts
          }
          category={editingCategory}
          onSave={(items, images) => handleSaveItems(editingCategory, items, images)}
          onCancel={() => setEditingCategory(null)}
        />
      )}

      {/* Saving Overlay */}
      {isSaving && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6">
            <div className="text-center">保存中...</div>
          </div>
        </div>
      )}
    </div>
  )
}
