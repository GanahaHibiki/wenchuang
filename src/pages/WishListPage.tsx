import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { wishApi, shopApi, type WishProduct } from '@/api/client'
import { useHistoryState } from '@/hooks/useHistoryState'
import type { Shop, ProductSearchType } from '@/types'
import SearchBar from '@/components/common/SearchBar'
import WishProductCard from '@/components/wish/WishProductCard'
import AddWishModal from '@/components/wish/AddWishModal'

const ITEMS_PER_PAGE = 50

export default function WishListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialShop = searchParams.get('shop') || ''
  const searchKeyword = searchParams.get('keyword') ?? initialShop
  const searchType = searchParams.get('type') === 'shopName' || initialShop
    ? 'shopName' : 'productName'
  const [visibleCount, setVisibleCount] = useHistoryState('wishVisibleCount', ITEMS_PER_PAGE)
  const [allProducts, setAllProducts] = useState<WishProduct[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [shops, setShops] = useState<Shop[]>([])
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const loadProducts = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setAllProducts(await wishApi.search(searchType, searchKeyword))
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setIsLoading(false)
    }
  }, [searchType, searchKeyword])

  useEffect(() => { loadProducts() }, [loadProducts])
  useEffect(() => {
    shopApi.getAllShops().then(setShops).catch(console.error)
  }, [])

  const handleSearch = (type: ProductSearchType, keyword: string) => {
    if (type === 'artist') return
    // Search is a preference on this page, not another page to return through.
    setSearchParams(keyword ? { type, keyword } : { type }, { replace: true })
  }

  const loadMore = useCallback(() => {
    setVisibleCount(previous => Math.min(previous + ITEMS_PER_PAGE, allProducts.length))
  }, [setVisibleCount, allProducts.length])
  const hasMore = visibleCount < allProducts.length
  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || isLoading || !hasMore) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadMore()
    }, { threshold: 0.1 })
    observer.observe(target)
    return () => observer.disconnect()
  }, [loadMore, isLoading, hasMore, visibleCount])

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个心愿商品吗？')) return
    try {
      await wishApi.delete(id)
      loadProducts()
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败')
    }
  }

  const handleAddSuccess = () => {
    setShowAddModal(false)
    loadProducts()
    shopApi.getAllShops().then(setShops).catch(console.error)
  }

  const displayedProducts = allProducts.slice(0, visibleCount)

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-4">
        <SearchBar onSearch={handleSearch} initialType={searchType} initialKeyword={searchKeyword} />
      </div>
      <div className="flex items-center justify-between">
        <div className="text-gray-600">
          {searchKeyword ? (
            <span>搜索到 {allProducts.length} 个心愿商品</span>
          ) : (
            <span>总 {allProducts.length} 件心愿商品</span>
          )}
          {displayedProducts.length < allProducts.length && (
            <span className="ml-2 text-gray-400">(已显示 {displayedProducts.length} 个)</span>
          )}
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          添加心愿商品
        </button>
      </div>
      {isLoading ? (
        <div data-scroll-loading className="text-center py-12 text-gray-500">加载中...</div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">{error}</div>
      ) : (
        <>
          {displayedProducts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {searchKeyword ? '未找到匹配的心愿商品' : '暂无心愿商品，点击上方按钮添加'}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
              {displayedProducts.map(product => (
                <WishProductCard key={product.id} product={product}
                  onDelete={() => handleDelete(product.id)} onUpdate={loadProducts} />
              ))}
            </div>
          )}
          {hasMore && (
            <div ref={loadMoreRef} className="text-center py-8 text-gray-400">加载更多...</div>
          )}
          {!hasMore && displayedProducts.length > 0 && (
            <div className="text-center py-8 text-gray-400">已显示全部心愿商品</div>
          )}
        </>
      )}
      {showAddModal && (
        <AddWishModal shops={shops} onClose={() => setShowAddModal(false)} onSuccess={handleAddSuccess} />
      )}
    </div>
  )
}
