import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { wishApi, shopApi, type WishProduct } from '@/api/client'
import type { Shop } from '@/types'
import SearchBar from '@/components/common/SearchBar'
import WishProductCard from '@/components/wish/WishProductCard'
import AddWishModal from '@/components/wish/AddWishModal'

const ITEMS_PER_PAGE = 50

export default function WishListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialShop = searchParams.get('shop') || ''

  const [allProducts, setAllProducts] = useState<WishProduct[]>([])
  const [displayedProducts, setDisplayedProducts] = useState<WishProduct[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchKeyword, setSearchKeyword] = useState(initialShop)
  const [searchType, setSearchType] = useState<'productName' | 'shopName'>(
    initialShop ? 'shopName' : 'productName'
  )
  const [showAddModal, setShowAddModal] = useState(false)
  const [shops, setShops] = useState<Shop[]>([])
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const loadProducts = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const data = await wishApi.search(searchType, searchKeyword)
      setAllProducts(data)
      setDisplayedProducts(data.slice(0, ITEMS_PER_PAGE))
      setCurrentPage(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setIsLoading(false)
    }
  }, [searchType, searchKeyword])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  useEffect(() => {
    shopApi.getAllShops().then(setShops).catch(console.error)
  }, [])

  const handleSearch = async (type: 'productName' | 'shopName', keyword: string) => {
    setSearchType(type)
    setSearchKeyword(keyword)
    // Update URL params
    if (keyword && type === 'shopName') {
      setSearchParams({ shop: keyword })
    } else {
      setSearchParams({})
    }
  }

  const loadMore = useCallback(() => {
    if (displayedProducts.length >= allProducts.length) return

    const nextPage = currentPage + 1
    const endIndex = nextPage * ITEMS_PER_PAGE
    const moreProducts = allProducts.slice(0, endIndex)

    setDisplayedProducts(moreProducts)
    setCurrentPage(nextPage)
  }, [currentPage, displayedProducts.length, allProducts])

  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect()
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current)
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [loadMore, isLoading])

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

  const hasMore = displayedProducts.length < allProducts.length

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="bg-white rounded-lg shadow p-4">
        <SearchBar
          onSearch={handleSearch}
          initialType={searchType}
          initialKeyword={searchKeyword}
        />
      </div>

      {/* Count and Add Button */}
      <div className="flex items-center justify-between">
        <div className="text-gray-600">
          {searchKeyword ? (
            <span>搜索到 {allProducts.length} 个心愿商品</span>
          ) : (
            <span>总 {allProducts.length} 件心愿商品</span>
          )}
          {displayedProducts.length < allProducts.length && (
            <span className="ml-2 text-gray-400">
              (已显示 {displayedProducts.length} 个)
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          添加心愿商品
        </button>
      </div>

      {/* Loading / Error / Content */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
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
              {displayedProducts.map((product) => (
                <WishProductCard
                  key={product.id}
                  product={product}
                  onDelete={() => handleDelete(product.id)}
                />
              ))}
            </div>
          )}

          {hasMore && (
            <div ref={loadMoreRef} className="text-center py-8 text-gray-400">
              加载更多...
            </div>
          )}

          {!hasMore && displayedProducts.length > 0 && (
            <div className="text-center py-8 text-gray-400">
              已显示全部心愿商品
            </div>
          )}
        </>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <AddWishModal
          shops={shops}
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddSuccess}
        />
      )}
    </div>
  )
}
