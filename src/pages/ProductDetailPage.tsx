import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { productApi } from '@/api/client'
import type { ProductDetail, ProductStyle, ProductReference } from '@/types'
import { DEFAULT_PRODUCT_STYLE, getProductStyle } from '@/types'
import ImageViewer from '@/components/common/ImageViewer'
import StyleInput from '@/components/common/StyleInput'
import ArtistInput from '@/components/common/ArtistInput'
import RelatedProductSelector from '@/components/common/RelatedProductSelector'
import ProgressiveImage from '@/components/common/ProgressiveImage'
import BackButton from '@/components/common/BackButton'
import ProductOrderRecords from '@/components/product/ProductOrderRecords'

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
  const [styleDraft, setStyleDraft] = useState<ProductStyle | ''>(DEFAULT_PRODUCT_STYLE)
  const [savingStyle, setSavingStyle] = useState(false)
  const [styleError, setStyleError] = useState<string | null>(null)
  const [editingRelations, setEditingRelations] = useState(false)
  const [relationsDraft, setRelationsDraft] = useState<ProductReference[]>([])
  const [savingRelations, setSavingRelations] = useState(false)
  const [relationsError, setRelationsError] = useState<string | null>(null)
  const saving = savingArtist || savingStyle || savingRelations

  useEffect(() => {
    if (!id) return
    let active = true
    setIsLoading(true)
    setError(null)
    productApi.getDetail(id)
      .then(data => { if (active) setProduct(data) })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : '加载失败') })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [id])

  const saveArtist = async () => {
    if (!id || !product || saving) return
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
    if (!id || !product || saving) return
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

  const saveRelations = async () => {
    if (!id || !product || saving) return
    setSavingRelations(true)
    setRelationsError(null)
    try {
      await productApi.updateRelations(id, relationsDraft.map(entry => entry.id))
      setProduct(await productApi.getDetail(id))
      setEditingRelations(false)
    } catch (err) {
      setRelationsError(err instanceof Error ? err.message : '保存关联失败')
    } finally {
      setSavingRelations(false)
    }
  }

  if (isLoading) return <div data-scroll-loading className="text-center py-12 text-gray-500">加载中...</div>
  if (error || !product) return <div className="text-center py-12 text-red-500">{error || '商品不存在'}</div>

  const members = product.linkedProducts || []
  const grouped = members.length > 1
  const title = grouped ? members.map(member => member.name).join(' / ') : product.name
  const sourceShopName = [...product.entries.purchased, ...product.entries.gifts, ...product.entries.smallGifts]
    .find(entry => entry.shopName && entry.shopName !== '未知店铺' && entry.shopName !== '拼单')?.shopName
    || members.find(member => member.id === product.id)?.shopName || ''
  const displayedImage = product.displayImage || product

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold break-words">{title}</h1>
        <BackButton />
      </div>
      {grouped && <p className="text-sm text-gray-600">当前编辑商品：{product.name}（{sourceShopName || '未识别店铺'}）。美工和分类只修改该店铺的商品。</p>}

      <section className="bg-white rounded-lg shadow p-4">
        {editingArtist ? (
          <form onSubmit={event => { event.preventDefault(); saveArtist() }} className="space-y-3">
            <ArtistInput value={artistDraft} onChange={setArtistDraft} disabled={saving} />
            <p className="text-xs text-gray-500">留空可清除。同店铺同名商品的历史记录会同步更新。</p>
            <div className="flex gap-3">
              <button type="submit" disabled={saving} className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50">
                {savingArtist ? '保存中...' : '保存美工'}
              </button>
              <button type="button" disabled={saving} onClick={() => { setEditingArtist(false); setArtistError(null) }} className="px-3 py-1 bg-gray-200 rounded">取消</button>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-gray-700">美工：{product.artist ? (
              <Link className="text-blue-600 hover:underline" to={`/?type=artist&keyword=${encodeURIComponent(product.artist)}&exact=true`}>{product.artist}</Link>
            ) : '未填写'}</span>
            <button type="button" disabled={saving} className="text-sm text-blue-600 hover:underline" onClick={() => {
              setArtistDraft(product.artist || ''); setArtistError(null); setEditingArtist(true)
            }}>编辑美工</button>
          </div>
        )}
        {artistError && <p role="alert" className="mt-2 text-sm text-red-600">{artistError}</p>}

        <div className="mt-4 border-t pt-4">
          {editingStyle ? (
            <form onSubmit={event => { event.preventDefault(); saveStyle() }} className="space-y-3">
              <StyleInput value={styleDraft} onChange={setStyleDraft} disabled={saving} />
              <p className="text-xs text-gray-500">未选择时默认食物系。同店铺同名商品的历史记录会同步更新。</p>
              <div className="flex gap-3">
                <button type="submit" disabled={saving} className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50">{savingStyle ? '保存中...' : '保存分类'}</button>
                <button type="button" disabled={saving} onClick={() => { setEditingStyle(false); setStyleError(null) }} className="px-3 py-1 bg-gray-200 rounded">取消</button>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-gray-700">风格分类：{getProductStyle(product.style)}</span>
              <button type="button" disabled={saving} className="text-sm text-blue-600 hover:underline" onClick={() => {
                setStyleDraft(getProductStyle(product.style)); setStyleError(null); setEditingStyle(true)
              }}>编辑风格分类</button>
            </div>
          )}
          {styleError && <p role="alert" className="mt-2 text-sm text-red-600">{styleError}</p>}
        </div>

        <div className="mt-4 border-t pt-4">
          {editingRelations ? (
            <form onSubmit={event => { event.preventDefault(); saveRelations() }} className="space-y-3">
              <RelatedProductSelector shopName={sourceShopName} productId={product.id} value={relationsDraft} onChange={setRelationsDraft} disabled={saving} />
              <p className="text-xs text-gray-500">保存会更新当前商品的同款关联；移除全部选项可解除当前商品关联。</p>
              <div className="flex gap-3">
                <button type="submit" disabled={saving} className="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50">{savingRelations ? '保存中...' : '保存关联'}</button>
                <button type="button" disabled={saving} onClick={() => { setEditingRelations(false); setRelationsError(null) }} className="px-3 py-1 bg-gray-200 rounded">取消</button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-gray-700">同款关联：{grouped ? `${members.length} 个商品` : '未关联'}</span>
              <button type="button" disabled={saving} className="text-sm text-blue-600 hover:underline" onClick={() => {
                setRelationsDraft(product.relationTargets || members.filter(member => member.shopName !== sourceShopName && member.id !== product.id))
                setRelationsError(null); setEditingRelations(true)
              }}>编辑关联商品</button>
            </div>
          )}
          {relationsError && <p role="alert" className="mt-2 text-sm text-red-600">{relationsError}</p>}
        </div>
      </section>

      <div className="flex gap-6">
        <div className="w-[640px] flex-shrink-0">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="cursor-pointer" onClick={() => setShowViewer(true)}>
              <ProgressiveImage src={`/images/original/${displayedImage.imagePath}`} previewSrc={`/images/thumbnails/${displayedImage.thumbnailPath}`} alt={title} />
              <p className="text-center text-sm text-gray-500 mt-2">点击查看大图</p>
              {grouped && <p className="text-center text-xs text-gray-500 mt-1">{product.displayImage ? '展示同款组中分辨率最大的图片' : '图片尺寸暂不可用，使用当前商品图片'}</p>}
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-6">
          {grouped ? members.map(member => (
            <section key={member.id} aria-label={`${member.name}（${member.shopName}）订单记录`} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-bold">{member.name} — {member.shopName}</h2>
                {member.id !== product.id && <Link to={`/products/${member.id}`} className="text-sm text-blue-600 hover:underline">编辑该店铺商品</Link>}
              </div>
              <ProductOrderRecords entries={member.entries} grouped />
            </section>
          )) : <ProductOrderRecords entries={product.entries} />}
        </div>
      </div>
      {showViewer && <ImageViewer src={`/images/original/${displayedImage.imagePath}`} alt={title} onClose={() => setShowViewer(false)} />}
    </div>
  )
}
