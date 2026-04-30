import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { productApi } from '@/api/client'
import type { ProductDetail } from '@/types'
import ImageViewer from '@/components/common/ImageViewer'
import { sortSpecifications } from '@/utils/specificationSort'

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showViewer, setShowViewer] = useState(false)

  useEffect(() => {
    if (!id) return

    const loadProduct = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const data = await productApi.getDetail(id)
        setProduct(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败')
      } finally {
        setIsLoading(false)
      }
    }

    loadProduct()
  }, [id])

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">加载中...</div>
  }

  if (error || !product) {
    return <div className="text-center py-12 text-red-500">{error || '商品不存在'}</div>
  }

  // Helper function to display specification type with custom name
  const getSpecTypeName = (spec: { type: string; customType?: string }) => {
    if ((spec.type === '其他衍生' || spec.type === '其他贴纸') && spec.customType) {
      return spec.customType
    }
    return spec.type
  }

  // Helper function to format order label based on order type
  const getOrderLabel = (entry: { orderType?: string; orderSequence: number; groupSequenceNumber?: number; shopName: string }) => {
    if (entry.orderType === 'group') {
      const seq = entry.groupSequenceNumber || entry.orderSequence
      return `拼单 #${seq} - ${entry.shopName}`
    }
    return `订单 #${entry.orderSequence} - ${entry.shopName}`
  }

  const { entries } = product

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{product.name}</h1>
        <Link to="/" className="text-blue-500 hover:underline">
          返回首页
        </Link>
      </div>

      {/* Main Content - Left-Right Layout */}
      <div className="flex gap-6">
        {/* Left: Product Image */}
        <div className="w-[640px] flex-shrink-0">
          <div className="bg-white rounded-lg shadow p-6">
            <div
              className="cursor-pointer"
              onClick={() => setShowViewer(true)}
            >
              <img
                src={`/images/original/${product.imagePath}`}
                alt={product.name}
                className="w-full rounded-lg hover:opacity-90 transition-opacity"
              />
              <p className="text-center text-sm text-gray-500 mt-2">点击查看大图</p>
            </div>
          </div>
        </div>

        {/* Right: All Records */}
        <div className="flex-1 space-y-6">
          {/* Purchased entries */}
          {entries.purchased.length > 0 && (
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold mb-4">已购商品记录</h2>
              <div className="space-y-4">
                {entries.purchased.map((entry, index) => {
                  // Sort specifications by display order
                  const sortedSpecs = sortSpecifications(entry.specifications)

                  // Check which spec types have multiple entries in this order
                  const specTypeCounts = new Map<string, number>()
                  sortedSpecs.forEach(spec => {
                    const typeName = getSpecTypeName(spec)
                    specTypeCounts.set(typeName, (specTypeCounts.get(typeName) || 0) + 1)
                  })

                  return (
                    <div key={index} className="border-l-4 border-blue-500 pl-4 py-2">
                      <Link
                        to={`/orders/${entry.orderId}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {getOrderLabel(entry)}
                      </Link>
                      <div className="mt-2 space-y-1">
                        {sortedSpecs
                          .filter((s) => s.quantity > 0)
                          .map((spec, i) => {
                            const typeName = getSpecTypeName(spec)
                            const hasMultiple = (specTypeCounts.get(typeName) || 0) > 1

                            return (
                              <div key={i} className="text-sm text-gray-600">
                                {typeName}
                                {hasMultiple && spec.sequenceNumber}:
                                {' '}{spec.quantity} 个,
                                购入价 ¥{spec.purchasePrice?.toFixed(2) || '0.00'},
                                原价 ¥{spec.originalPrice.toFixed(2)}
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Gift entries */}
          {entries.gifts.length > 0 && (
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold mb-4">礼品记录</h2>
              <div className="space-y-4">
                {entries.gifts.map((entry, index) => {
                  // Sort specifications by display order
                  const sortedSpecs = sortSpecifications(entry.specifications)

                  // Check which spec types have multiple entries in this order
                  const specTypeCounts = new Map<string, number>()
                  sortedSpecs.forEach(spec => {
                    const typeName = getSpecTypeName(spec)
                    specTypeCounts.set(typeName, (specTypeCounts.get(typeName) || 0) + 1)
                  })

                  return (
                    <div key={index} className="border-l-4 border-green-500 pl-4 py-2">
                      <Link
                        to={`/orders/${entry.orderId}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {getOrderLabel(entry)}
                      </Link>
                      <span className="ml-2 text-sm bg-green-100 text-green-700 px-2 py-0.5 rounded">
                        {entry.giftType}
                      </span>
                      <div className="mt-2 space-y-1">
                        {sortedSpecs
                          .filter((s) => s.quantity > 0)
                          .map((spec, i) => {
                            const typeName = getSpecTypeName(spec)
                            const hasMultiple = (specTypeCounts.get(typeName) || 0) > 1

                            return (
                              <div key={i} className="text-sm text-gray-600">
                                {typeName}
                                {hasMultiple && spec.sequenceNumber}:
                                {' '}{spec.quantity} 个,
                                原价 ¥{spec.originalPrice.toFixed(2)}
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Small gift entries */}
          {entries.smallGifts.length > 0 && (
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold mb-4">小礼物记录</h2>
              <div className="space-y-4">
                {entries.smallGifts.map((entry, index) => {
                  // Sort specifications by display order
                  const sortedSpecs = sortSpecifications(entry.specifications)

                  // Check which spec types have multiple entries in this order
                  const specTypeCounts = new Map<string, number>()
                  sortedSpecs.forEach(spec => {
                    const typeName = getSpecTypeName(spec)
                    specTypeCounts.set(typeName, (specTypeCounts.get(typeName) || 0) + 1)
                  })

                  return (
                    <div key={index} className="border-l-4 border-purple-500 pl-4 py-2">
                      <Link
                        to={`/orders/${entry.orderId}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {getOrderLabel(entry)}
                      </Link>
                      <div className="mt-2 space-y-1">
                        {sortedSpecs
                          .filter((s) => s.quantity > 0)
                          .map((spec, i) => {
                            const typeName = getSpecTypeName(spec)
                            const hasMultiple = (specTypeCounts.get(typeName) || 0) > 1

                            return (
                              <div key={i} className="text-sm text-gray-600">
                                {typeName}
                                {hasMultiple && spec.sequenceNumber}:
                                {' '}{spec.quantity} 个,
                                原价 ¥{spec.originalPrice.toFixed(2)}
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* No entries */}
          {entries.purchased.length === 0 &&
            entries.gifts.length === 0 &&
            entries.smallGifts.length === 0 && (
              <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
                该商品暂无订单记录
              </div>
            )}
        </div>
      </div>

      {/* Image Viewer */}
      {showViewer && (
        <ImageViewer
          src={`/images/original/${product.imagePath}`}
          alt={product.name}
          onClose={() => setShowViewer(false)}
        />
      )}
    </div>
  )
}
