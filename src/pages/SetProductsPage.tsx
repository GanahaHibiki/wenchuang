import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { productApi, SetProduct } from '@/api/client'
import LazyImage from '@/components/common/LazyImage'

export default function SetProductsPage() {
  const [products, setProducts] = useState<SetProduct[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">加载中...</div>
  }

  if (error) {
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

      {products.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          暂无符合条件的set商品
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
          {products.map((product) => (
            <Link
              key={product.productId}
              to={`/products/${product.productId}`}
              className="bg-white rounded-lg shadow hover:shadow-md transition-shadow overflow-hidden"
            >
              <div className="aspect-[4/3] bg-gray-100">
                <LazyImage
                  src={`/images/thumbnails/${product.thumbnailPath}`}
                  alt={product.productName}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-3">
                <h3 className="font-medium text-gray-900 mb-2 line-clamp-2">
                  {product.productName}
                </h3>
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
          ))}
        </div>
      )}
    </div>
  )
}
