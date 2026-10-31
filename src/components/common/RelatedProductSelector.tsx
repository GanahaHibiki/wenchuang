import { useEffect, useId, useRef, useState } from 'react'
import { productApi } from '@/api/client'
import type { ProductReference } from '@/types'

interface RelatedProductSelectorProps {
  shopName: string
  productId?: string
  value?: ProductReference[]
  onChange: (products: ProductReference[]) => void
  disabled?: boolean
  draft?: boolean
}

export default function RelatedProductSelector({ shopName, productId, value, onChange, disabled = false, draft = false }: RelatedProductSelectorProps) {
  const id = useId()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [keyword, setKeyword] = useState('')
  const [candidates, setCandidates] = useState<ProductReference[]>([])
  const [loading, setLoading] = useState(false)
  const [candidateError, setCandidateError] = useState<string | null>(null)
  const [relationError, setRelationError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const needsExistingRelations = Boolean(productId) && value === undefined
  const unavailable = disabled || needsExistingRelations || (draft ? !shopName.trim() : (!shopName.trim() && !productId))
  const selected = value || []

  useEffect(() => {
    if (!productId || value !== undefined) {
      setRelationError(null)
      return
    }
    let active = true
    setRelationError(null)
    productApi.getRelations(productId)
      .then(products => { if (active) onChangeRef.current(products) })
      .catch(error => { if (active) setRelationError(error instanceof Error ? error.message : '关联加载失败') })
    return () => { active = false }
  }, [productId, value, retry])

  useEffect(() => {
    setKeyword('')
    setCandidates([])
  }, [shopName, productId])

  useEffect(() => {
    setCandidates([])
    setCandidateError(null)
    if (!keyword.trim() || unavailable) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    const timer = window.setTimeout(() => {
      productApi.getLinkCandidates(shopName, keyword.trim(), draft ? undefined : productId)
        .then(products => { if (active) setCandidates(products) })
        .catch(error => { if (active) setCandidateError(error instanceof Error ? error.message : '查询失败') })
        .finally(() => { if (active) setLoading(false) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [shopName, productId, keyword, unavailable, draft])

  const selectedIds = new Set(selected.map(product => product.id))
  const available = candidates.filter(product => !selectedIds.has(product.id))
  const hasSameShop = shopName.trim() && selected.some(product => product.shopName.trim().toLowerCase() === shopName.trim().toLowerCase())

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        关联同款商品（选填）
      </label>
      <p className="text-xs text-gray-500">仅可选择其他店铺已录入的商品。关联已有同款组中的商品会合并整组。</p>
      {selected.length > 0 && (
        <ul aria-label="已选择的关联商品" className="flex flex-wrap gap-2">
          {selected.map(product => (
            <li key={product.id} className="flex items-center gap-2 px-3 py-1 bg-blue-50 rounded border border-blue-200 text-sm">
              <span>{product.name}（{product.shopName}）</span>
              <button type="button" disabled={disabled} aria-label={`移除关联 ${product.name}（${product.shopName}）`}
                onClick={() => onChange(selected.filter(entry => entry.id !== product.id))}
                className="text-red-600 hover:underline">移除</button>
            </li>
          ))}
        </ul>
      )}
      {hasSameShop && <p role="alert" className="text-sm text-red-600">店铺已改变，请移除属于当前店铺的关联商品。</p>}
      {needsExistingRelations && !relationError && <p className="text-xs text-gray-500">正在加载已有同款关联...</p>}
      {relationError && (
        <div role="alert" className="text-sm text-red-600">
          {relationError} <button type="button" onClick={() => setRetry(count => count + 1)} className="underline">重试</button>
        </div>
      )}
      <input id={id} type="text" value={keyword} disabled={unavailable}
        onChange={event => setKeyword(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') event.preventDefault() }}
        placeholder="输入其他店铺的商品名查找"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      {!shopName.trim() && !productId && <p className="text-xs text-gray-500">请先填写店铺名称。</p>}
      {loading && <p className="text-xs text-gray-500">正在查找候选商品...</p>}
      {candidateError && <p role="alert" className="text-sm text-red-600">{candidateError}</p>}
      {!unavailable && keyword.trim() && !loading && !candidateError && available.length === 0 && (
        <p className="text-xs text-gray-500">没有未选中的匹配商品（只搜索其他店铺已录入商品）。</p>
      )}
      {available.length > 0 && (
        <ul aria-label="关联候选商品" className="max-h-60 overflow-y-auto border rounded-lg divide-y">
          {available.map(product => (
            <li key={product.id}>
              <button type="button" disabled={disabled} aria-label={`关联 ${product.name}（${product.shopName}）`}
                onClick={() => { onChange([...selected, product]); setKeyword('') }}
                className="w-full flex gap-3 items-center p-2 text-left hover:bg-blue-50">
                <img src={`/images/thumbnails/${product.thumbnailPath}`} alt="" loading="lazy" decoding="async"
                  className="w-12 h-9 rounded object-cover bg-gray-100 flex-shrink-0" />
                <span><span className="block text-sm">{product.name}</span><span className="block text-xs text-gray-500">店铺：{product.shopName}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {candidates.length >= 50 && <p className="text-xs text-gray-500">最多显示50条候选，请细化商品名称。</p>}
    </div>
  )
}
