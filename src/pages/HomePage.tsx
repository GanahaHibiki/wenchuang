import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { productApi, type ProductWithShop } from '@/api/client'
import { useHistoryState } from '@/hooks/useHistoryState'
import type { ProductSearchType } from '@/types'
import SearchBar from '@/components/common/SearchBar'
import ProductGrid from '@/components/product/ProductGrid'

const ITEMS_PER_PAGE = 50

interface GalleryView {
  searchType: ProductSearchType
  searchKeyword: string
  visibleCount: number
  exact?: boolean
}

export default function HomePage() {
  const [searchParams] = useSearchParams()
  const shopName = searchParams.get('shop') || ''
  const requestedType = searchParams.get('type')
  const initialSearchType: ProductSearchType = requestedType === 'artist' ? 'artist'
    : requestedType === 'shopName' || shopName ? 'shopName' : 'productName'
  const [view, setView] = useHistoryState<GalleryView>('productGallery', {
    searchType: initialSearchType,
    searchKeyword: searchParams.get('keyword') ?? shopName,
    visibleCount: ITEMS_PER_PAGE,
    exact: searchParams.get('exact') === 'true',
  })
  const { searchType, searchKeyword, visibleCount, exact = false } = view
  const [allProducts, setAllProducts] = useState<ProductWithShop[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    setIsLoading(true)
    setError(null)
    productApi.search(searchType, searchKeyword, exact)
      .then(data => { if (active) setAllProducts(data) })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : '加载失败') })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [searchType, searchKeyword, exact])

  const handleSearch = (type: GalleryView['searchType'], keyword: string) => {
    setView({ searchType: type, searchKeyword: keyword, visibleCount: ITEMS_PER_PAGE })
  }

  const loadMore = useCallback(() => {
    setView(previous => ({
      ...previous,
      visibleCount: Math.min(previous.visibleCount + ITEMS_PER_PAGE, allProducts.length),
    }))
  }, [setView, allProducts.length])

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

  const displayedProducts = allProducts.slice(0, visibleCount)

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-4">
        <SearchBar onSearch={handleSearch} initialType={searchType} initialKeyword={searchKeyword} enableArtist />
      </div>
      <div className="text-gray-600">
        {searchKeyword ? (
          <span>搜索到 {allProducts.length} 个商品</span>
        ) : (
          <span>总 {allProducts.length} 件商品</span>
        )}
        {displayedProducts.length < allProducts.length && (
          <span className="ml-2 text-gray-400">(已显示 {displayedProducts.length} 个)</span>
        )}
      </div>
      {isLoading ? (
        <div data-scroll-loading className="text-center py-12 text-gray-500">加载中...</div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">{error}</div>
      ) : (
        <>
          <ProductGrid
            products={displayedProducts}
            emptyMessage={searchKeyword ? '未找到匹配的商品' : '暂无商品，请先录入订单'}
          />
          {hasMore && (
            <div ref={loadMoreRef} className="text-center py-8 text-gray-400">加载更多...</div>
          )}
          {!hasMore && displayedProducts.length > 0 && (
            <div className="text-center py-8 text-gray-400">已显示全部商品</div>
          )}
        </>
      )}
    </div>
  )
}
