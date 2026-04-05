import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { productApi } from '@/api/client'
import type { Product } from '@/types'
import SearchBar from '@/components/common/SearchBar'
import ProductGrid from '@/components/product/ProductGrid'
import Pagination from '@/components/common/Pagination'

const ITEMS_PER_PAGE = 50

export default function HomePage() {
  const [searchParams] = useSearchParams()
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchType, setSearchType] = useState<'productName' | 'shopName'>('productName')

  // Initialize from URL params and update when URL changes
  useEffect(() => {
    const shopName = searchParams.get('shop')
    if (shopName) {
      setSearchType('shopName')
      setSearchKeyword(shopName)
    } else {
      // Clear search when no shop param
      setSearchType('productName')
      setSearchKeyword('')
    }
  }, [searchParams])

  const loadProducts = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const data = await productApi.search(searchType, searchKeyword)
      setProducts(data)
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

  const handleSearch = (type: 'productName' | 'shopName', keyword: string) => {
    setSearchType(type)
    setSearchKeyword(keyword)
  }

  // Pagination
  const totalPages = Math.ceil(products.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginatedProducts = products.slice(startIndex, startIndex + ITEMS_PER_PAGE)

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
          <span>搜索到 {products.length} 个商品</span>
        ) : (
          <span>总 {products.length} 件商品</span>
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
            products={paginatedProducts}
            emptyMessage={
              searchKeyword ? '未找到匹配的商品' : '暂无商品，请先录入订单'
            }
          />

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </>
      )}
    </div>
  )
}
