import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { productApi } from '@/api/client'
import type { Product } from '@/types'
import SearchBar from '@/components/common/SearchBar'
import ProductGrid from '@/components/product/ProductGrid'

const ITEMS_PER_PAGE = 50

export default function HomePage() {
  const [searchParams] = useSearchParams()
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [displayedProducts, setDisplayedProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchType, setSearchType] = useState<'productName' | 'shopName'>('productName')
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  // Initialize from URL params and load products when URL changes
  useEffect(() => {
    const shopName = searchParams.get('shop')
    let type: 'productName' | 'shopName' = 'productName'
    let keyword = ''

    if (shopName) {
      type = 'shopName'
      keyword = shopName
    }

    setSearchType(type)
    setSearchKeyword(keyword)

    // Load products with new parameters
    setIsLoading(true)
    setError(null)

    productApi.search(type, keyword)
      .then(data => {
        setAllProducts(data)
        setDisplayedProducts(data.slice(0, ITEMS_PER_PAGE))
        setCurrentPage(1)
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : '加载失败')
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [searchParams])

  const handleSearch = async (type: 'productName' | 'shopName', keyword: string) => {
    setSearchType(type)
    setSearchKeyword(keyword)

    setIsLoading(true)
    setError(null)

    try {
      const data = await productApi.search(type, keyword)
      setAllProducts(data)
      setDisplayedProducts(data.slice(0, ITEMS_PER_PAGE))
      setCurrentPage(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setIsLoading(false)
    }
  }

  // Load more products when scrolling
  const loadMore = useCallback(() => {
    if (displayedProducts.length >= allProducts.length) return

    const nextPage = currentPage + 1
    const startIndex = nextPage * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    const moreProducts = allProducts.slice(0, endIndex)

    setDisplayedProducts(moreProducts)
    setCurrentPage(nextPage)
  }, [currentPage, displayedProducts.length, allProducts])

  // Setup intersection observer for infinite scroll
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

      {/* Count */}
      <div className="text-gray-600">
        {searchKeyword ? (
          <span>搜索到 {allProducts.length} 个商品</span>
        ) : (
          <span>总 {allProducts.length} 件商品</span>
        )}
        {displayedProducts.length < allProducts.length && (
          <span className="ml-2 text-gray-400">
            (已显示 {displayedProducts.length} 个)
          </span>
        )}
      </div>

      {/* Loading / Error / Content */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">{error}</div>
      ) : (
        <>
          <ProductGrid
            products={displayedProducts}
            emptyMessage={
              searchKeyword ? '未找到匹配的商品' : '暂无商品，请先录入订单'
            }
          />

          {/* Load more trigger */}
          {hasMore && (
            <div ref={loadMoreRef} className="text-center py-8 text-gray-400">
              加载更多...
            </div>
          )}

          {!hasMore && displayedProducts.length > 0 && (
            <div className="text-center py-8 text-gray-400">
              已显示全部商品
            </div>
          )}
        </>
      )}
    </div>
  )
}
