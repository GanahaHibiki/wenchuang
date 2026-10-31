import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { productApi, type ProductWithShop } from '@/api/client'
import { useHistoryState } from '@/hooks/useHistoryState'
import { PRODUCT_STYLES, type ProductSearchType, type ProductStyle } from '@/types'
import SearchBar from '@/components/common/SearchBar'
import ProductGrid from '@/components/product/ProductGrid'

const ITEMS_PER_PAGE = 50

interface GalleryView {
  searchType: ProductSearchType
  searchKeyword: string
  visibleCount: number
  exact?: boolean
  style?: ProductStyle
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
    style: PRODUCT_STYLES.find(style => style === searchParams.get('style')),
  })
  const { searchType, searchKeyword, visibleCount, exact = false, style } = view
  const [allProducts, setAllProducts] = useState<ProductWithShop[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    setIsLoading(true)
    setError(null)
    productApi.search(searchType, searchKeyword, exact, style, true)
      .then(data => { if (active) setAllProducts(data) })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : '加载失败') })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [searchType, searchKeyword, exact, style])

  const handleSearch = (type: GalleryView['searchType'], keyword: string) => {
    setView(previous => ({ ...previous, searchType: type, searchKeyword: keyword, exact: false, visibleCount: ITEMS_PER_PAGE }))
  }

  const selectStyle = (style?: ProductStyle) => {
    setView(previous => ({ ...previous, style, visibleCount: ITEMS_PER_PAGE }))
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
      <div role="group" aria-label="风格分类筛选" className="flex flex-wrap gap-2">
        {[undefined, ...PRODUCT_STYLES].map(category => (
          <button key={category || 'all'} type="button" aria-pressed={style === category}
            onClick={() => selectStyle(category)}
            className={`px-4 py-2 rounded-lg border ${style === category
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}>
            {category || '全部'}
          </button>
        ))}
      </div>
      <div className="text-gray-600">
        {searchKeyword || style ? (
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
            styleFilter={style}
            emptyMessage={searchKeyword || style ? '未找到匹配的商品' : '暂无商品，请先录入订单'}
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
