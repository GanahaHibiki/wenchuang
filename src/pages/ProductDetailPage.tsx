import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { productApi } from '@/api/client'
import type { ProductDetail, ProductStyle } from '@/types'
import ImageViewer from '@/components/common/ImageViewer'
import StyleInput from '@/components/common/StyleInput'
import ArtistInput from '@/components/common/ArtistInput'
import ProgressiveImage from '@/components/common/ProgressiveImage'
import BackButton from '@/components/common/BackButton'
import { sortSpecifications } from '@/utils/specificationSort'

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showViewer, setShowViewer] = useState(false)
  const [editingArtist, setEditingArtist] = useState(false)
  const [artistDraft, setArtistDraft] = useState('')
  const [savingArtist, setSavingArtist] = useState(false)
  const [artistError, setArtistError] = useState<string | null>(null)
  const [editingStyle, setEditingStyle] = useState(false)
  const [styleDraft, setStyleDraft] = useState<ProductStyle | ''>('')
  const [savingStyle, setSavingStyle] = useState(false)
  const [styleError, setStyleError] = useState<string | null>(null)

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

  const saveArtist = async () => {
    if (!id || !product || savingArtist || savingStyle) return
    setSavingArtist(true)
    setArtistError(null)
    try {
      const updated = await productApi.updateArtist(id, artistDraft.trim())
      setProduct(previous => previous ? { ...previous, artist: updated.artist } : previous)
      setEditingArtist(false)
    } catch (err) {
      setArtistError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingArtist(false)
    }
  }

  const saveStyle = async () => {
    if (!id || !product || savingStyle || savingArtist) return
    setSavingStyle(true)
    setStyleError(null)
    try {
      const updated = await productApi.updateStyle(id, styleDraft)
      setProduct(previous => previous ? { ...previous, style: updated.style } : previous)
      setEditingStyle(false)
    } catch (err) {
      setStyleError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingStyle(false)
    }
  }

  if (isLoading) {
    return <div data-scroll-loading className="text-center py-12 text-gray-500">加载中...</div>
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
        <BackButton />
      </div>

      <section className="bg-white rounded-lg shadow p-4">
        {editingArtist ? (
          <form onSubmit={event => { event.preventDefault(); saveArtist() }} className="space-y-3">
            <ArtistInput value={artistDraft} onChange={setArtistDraft} disabled={savingArtist || savingStyle} />
            <p className="text-xs text-gray-500">留空可清除。同店铺同名商品的历史记录会同步更新。</p>
            <div className="flex gap-3">
              <button type="submit" disabled={savingArtist || savingStyle} className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50">
                {savingArtist ? '保存中...' : '保存美工'}
              </button>
              <button type="button" disabled={savingArtist} onClick={() => { setEditingArtist(false); setArtistError(null) }}
                className="px-3 py-1 bg-gray-200 rounded">取消</button>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-gray-700">美工：{product.artist ? (
              <Link className="text-blue-600 hover:underline" to={`/?type=artist&keyword=${encodeURIComponent(product.artist)}&exact=true`}>
                {product.artist}
              </Link>
            ) : '未填写'}</span>
            <button type="button" className="text-sm text-blue-600 hover:underline" onClick={() => {
              setArtistDraft(product.artist || '')
              setArtistError(null)
              setEditingArtist(true)
            }}>编辑美工</button>
          </div>
        )}
        {artistError && <p role="alert" className="mt-2 text-sm text-red-600">{artistError}</p>}
        <div className="mt-4 border-t pt-4">
          {editingStyle ? (
            <form onSubmit={event => { event.preventDefault(); saveStyle() }} className="space-y-3">
              <StyleInput value={styleDraft} onChange={setStyleDraft} disabled={savingStyle || savingArtist} />
              <p className="text-xs text-gray-500">选择未分类可清除。同店铺同名商品的历史记录会同步更新。</p>
              <div className="flex gap-3">
                <button type="submit" disabled={savingStyle || savingArtist}
                  className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50">
                  {savingStyle ? '保存中...' : '保存分类'}
                </button>
                <button type="button" disabled={savingStyle} onClick={() => { setEditingStyle(false); setStyleError(null) }}
                  className="px-3 py-1 bg-gray-200 rounded">取消</button>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-gray-700">风格分类：{product.style || '未分类'}</span>
              <button type="button" className="text-sm text-blue-600 hover:underline" onClick={() => {
                setStyleDraft(product.style || '')
                setStyleError(null)
                setEditingStyle(true)
              }}>编辑风格分类</button>
            </div>
          )}
          {styleError && <p role="alert" className="mt-2 text-sm text-red-600">{styleError}</p>}
        </div>
      </section>

      {/* Main Content - Left-Right Layout */}
      <div className="flex gap-6">
        {/* Left: Product Image */}
        <div className="w-[640px] flex-shrink-0">
          <div className="bg-white rounded-lg shadow p-6">
            <div
              className="cursor-pointer"
              onClick={() => setShowViewer(true)}
            >
              <ProgressiveImage
                src={`/images/original/${product.imagePath}`}
                previewSrc={`/images/thumbnails/${product.thumbnailPath}`}
                alt={product.name}
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
