import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { productApi } from '@/api/client'
import type { ProductDetail } from '@/types'
import ImageViewer from '@/components/common/ImageViewer'

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
    if (spec.type === '其他衍生' && spec.customType) {
      return spec.customType
    }
    return spec.type
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

      {/* Product Image */}
      <div className="bg-white rounded-lg shadow p-6">
        <div
          className="max-w-md mx-auto cursor-pointer"
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

      {/* Purchased entries */}
      {entries.purchased.length > 0 && (
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-bold mb-4">已购商品记录</h2>
          <div className="space-y-4">
            {entries.purchased.map((entry, index) => {
              // Check which spec types have multiple entries in this order
              const specTypeCounts = new Map<string, number>()
              entry.specifications.forEach(spec => {
                const typeName = getSpecTypeName(spec)
                specTypeCounts.set(typeName, (specTypeCounts.get(typeName) || 0) + 1)
              })

              return (
                <div key={index} className="border-l-4 border-blue-500 pl-4 py-2">
                  <Link
                    to={`/orders/${entry.orderId}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    订单 {entry.orderSequence} - {entry.shopName}
                  </Link>
                  <div className="mt-2 space-y-1">
                    {entry.specifications
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
              // Check which spec types have multiple entries in this order
              const specTypeCounts = new Map<string, number>()
              entry.specifications.forEach(spec => {
                const typeName = getSpecTypeName(spec)
                specTypeCounts.set(typeName, (specTypeCounts.get(typeName) || 0) + 1)
              })

              return (
                <div key={index} className="border-l-4 border-green-500 pl-4 py-2">
                  <Link
                    to={`/orders/${entry.orderId}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    订单 {entry.orderSequence} - {entry.shopName}
                  </Link>
                  <span className="ml-2 text-sm bg-green-100 text-green-700 px-2 py-0.5 rounded">
                    {entry.giftType}
                  </span>
                  <div className="mt-2 space-y-1">
                    {entry.specifications
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
              // Check which spec types have multiple entries in this order
              const specTypeCounts = new Map<string, number>()
              entry.specifications.forEach(spec => {
                const typeName = getSpecTypeName(spec)
                specTypeCounts.set(typeName, (specTypeCounts.get(typeName) || 0) + 1)
              })

              return (
                <div key={index} className="border-l-4 border-purple-500 pl-4 py-2">
                  <Link
                    to={`/orders/${entry.orderId}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    订单 {entry.orderSequence} - {entry.shopName}
                  </Link>
                  <div className="mt-2 space-y-1">
                    {entry.specifications
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
                    ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* No entries */}
      {entries.purchased.length === 0 &&
        entries.gifts.length === 0 &&
        entries.smallGifts.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            该商品暂无订单记录
          </div>
        )}

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
