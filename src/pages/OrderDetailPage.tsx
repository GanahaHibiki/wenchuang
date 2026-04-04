import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { orderApi } from '@/api/client'
import type { OrderDetail, OrderItem, Product } from '@/types'
import ImageViewer from '@/components/common/ImageViewer'

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewingImage, setViewingImage] = useState<string | null>(null)

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

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">加载中...</div>
  }

  if (error || !order) {
    return <div className="text-center py-12 text-red-500">{error || '订单不存在'}</div>
  }

  const renderItem = (item: OrderItem & { product: Product }, showPurchasePrice: boolean) => (
    <div key={item.id} className="flex gap-4 p-4 bg-gray-50 rounded-lg">
      <div
        className="w-24 h-32 bg-gray-200 rounded overflow-hidden cursor-pointer flex-shrink-0"
        onClick={() => setViewingImage(`/images/original/${item.product.imagePath}`)}
      >
        <img
          src={`/images/thumbnails/${item.product.thumbnailPath}`}
          alt={item.product.name}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex-1">
        <Link
          to={`/products/${item.product.id}`}
          className="font-medium text-blue-600 hover:underline"
        >
          {item.product.name}
        </Link>
        <div className="mt-2 space-y-1">
          {item.specifications.map((spec, index) => (
            <div key={index} className="text-sm text-gray-600">
              {spec.type}
              {spec.sequenceNumber > 1 && spec.sequenceNumber}:
              {' '}{spec.quantity} 个
              {showPurchasePrice && spec.purchasePrice !== undefined && (
                <> × ¥{spec.purchasePrice.toFixed(2)} = ¥{(spec.quantity * spec.purchasePrice).toFixed(2)}</>
              )}
              {!showPurchasePrice && (
                <> × ¥{spec.originalPrice.toFixed(2)} = ¥{(spec.quantity * spec.originalPrice).toFixed(2)}</>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )

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
        <h1 className="text-2xl font-bold">
          订单 #{order.sequenceNumber} - {order.shop.name}
        </h1>
        <Link
          to="/orders"
          className="text-blue-500 hover:underline"
        >
          返回列表
        </Link>
      </div>

      {/* Purchased Items */}
      <section className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">已购商品</h2>
          <span className="text-sm text-gray-500">{order.purchasedItems.length} 件</span>
        </div>
        <div className="space-y-4">
          {order.purchasedItems.length === 0 ? (
            <p className="text-gray-500">暂无已购商品</p>
          ) : (
            order.purchasedItems.map((item) => renderItem(item, true))
          )}
        </div>
      </section>

      {/* Gifts */}
      <section className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">礼品</h2>
          <span className="text-sm text-gray-500">{order.gifts.length} 件</span>
        </div>
        {order.gifts.length === 0 ? (
          <p className="text-gray-500">暂无礼品</p>
        ) : (
          <div className="space-y-6">
            {Object.entries(giftsByType).map(([type, gifts]) => (
              <div key={type}>
                <h3 className="text-md font-medium text-gray-700 mb-2">[{type}]</h3>
                <div className="space-y-4">
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
          <span className="text-sm text-gray-500">{order.smallGifts.length} 件</span>
        </div>
        <div className="space-y-4">
          {order.smallGifts.length === 0 ? (
            <p className="text-gray-500">暂无小礼物</p>
          ) : (
            order.smallGifts.map((item) => renderItem(item, false))
          )}
        </div>
      </section>

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

      {/* Image Viewer */}
      {viewingImage && (
        <ImageViewer
          src={viewingImage}
          onClose={() => setViewingImage(null)}
        />
      )}
    </div>
  )
}
