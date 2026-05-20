import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { productApi, SetProduct } from '@/api/client'
import LazyImage from '@/components/common/LazyImage'

export default function SetProductsPage() {
  const [products, setProducts] = useState<SetProduct[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [isMerging, setIsMerging] = useState(false)
  const [mergeResult, setMergeResult] = useState<{ filename: string; path: string } | null>(null)

  useEffect(() => {
    const loadProducts = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const data = await productApi.getSetProducts()
        setProducts(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败')
      } finally {
        setIsLoading(false)
      }
    }

    loadProducts()
  }, [])

  const toggleSelection = (imagePath: string) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev)
      if (next.has(imagePath)) {
        next.delete(imagePath)
      } else if (next.size < 9) {
        next.add(imagePath)
      }
      return next
    })
  }

  const handleMergeImages = async () => {
    if (selectedProducts.size === 0) return

    setIsMerging(true)
    setMergeResult(null)
    setError(null)

    try {
      const result = await productApi.mergeImages(Array.from(selectedProducts))
      setMergeResult({ filename: result.filename, path: result.path })
      setSelectedProducts(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : '拼接失败')
    } finally {
      setIsMerging(false)
    }
  }

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">加载中...</div>
  }

  if (error && !mergeResult) {
    return <div className="text-center py-12 text-red-500">{error}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Set商品浏览</h1>
        <span className="text-gray-600">共 {products.length} 件商品</span>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          显示条件：有大食量set、小食量set，或试吃set数量 ≥ 5 的商品
        </p>
      </div>

      {/* Selection toolbar */}
      <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <span className="text-gray-700">
            已选择 <span className="font-bold text-blue-600">{selectedProducts.size}</span> / 9 张图片
          </span>
          {selectedProducts.size > 0 && (
            <button
              onClick={() => setSelectedProducts(new Set())}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              清空选择
            </button>
          )}
        </div>
        <button
          onClick={handleMergeImages}
          disabled={selectedProducts.size === 0 || isMerging}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            selectedProducts.size === 0 || isMerging
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isMerging ? '拼接中...' : '生成拼接图'}
        </button>
      </div>

      {/* Merge result notification */}
      {mergeResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-green-800 font-medium">拼接完成！</p>
            <p className="text-sm text-green-600">文件已保存至 data/append/{mergeResult.filename}</p>
          </div>
          <a
            href={mergeResult.path}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            查看图片
          </a>
        </div>
      )}

      {error && mergeResult && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {products.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          暂无符合条件的set商品
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
          {products.map((product) => {
            const isSelected = selectedProducts.has(product.imagePath)
            const canSelect = selectedProducts.size < 9 || isSelected

            return (
              <div
                key={product.productId}
                className={`bg-white rounded-lg shadow hover:shadow-md transition-shadow overflow-hidden relative ${
                  isSelected ? 'ring-2 ring-blue-500' : ''
                }`}
              >
                {/* Selection checkbox */}
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (canSelect) toggleSelection(product.imagePath)
                  }}
                  className={`absolute top-2 left-2 z-10 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : canSelect
                      ? 'bg-white/80 border-gray-300 hover:border-blue-400'
                      : 'bg-gray-100/80 border-gray-200 cursor-not-allowed'
                  }`}
                >
                  {isSelected && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {!isSelected && canSelect && (
                    <span className="text-xs text-gray-400">{selectedProducts.size + 1}</span>
                  )}
                </button>

                <Link
                  to={`/products/${product.productId}?from=set-products`}
                  className="block"
                >
                  <div className="aspect-[4/3] bg-gray-100">
                    <LazyImage
                      src={`/images/thumbnails/${product.thumbnailPath}`}
                      alt={product.productName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-3">
                    <h3 className="font-medium text-gray-900 mb-1 line-clamp-2">
                      {product.productName}
                    </h3>
                    <p className="text-xs text-gray-500 mb-2 truncate">
                      {product.shopName}
                    </p>
                    <div className="space-y-1 text-sm">
                      {product.大食量set > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">大食量set:</span>
                          <span className="font-bold text-orange-600">{product.大食量set}</span>
                        </div>
                      )}
                      {product.小食量set > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">小食量set:</span>
                          <span className="font-bold text-blue-600">{product.小食量set}</span>
                        </div>
                      )}
                      {product.试吃set > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">试吃set:</span>
                          <span className="font-bold text-green-600">{product.试吃set}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
