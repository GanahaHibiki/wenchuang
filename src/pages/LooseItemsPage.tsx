import { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { productApi, LooseItemProduct } from '@/api/client'
import LazyImage from '@/components/common/LazyImage'

type CategoryKey = '折页' | '卡头' | '卡背' | '贴纸' | '贴纸包' | '衍生贴纸' | '售后卡' | '磨砂盒' | '其他衍生'

interface Category {
  key: CategoryKey
  label: string
  types: Array<keyof LooseItemProduct | 'customSticker' | 'customDerivative' | 'sequencedKatou' | 'sequencedFengkouti' | 'sequencedChangti'>
}

const CATEGORIES: Category[] = [
  { key: '折页', label: '折页', types: ['折页', '异形折页'] },
  { key: '卡头', label: '卡头', types: ['sequencedKatou'] },
  { key: '卡背', label: '卡背', types: ['卡背'] },
  { key: '贴纸', label: '贴纸', types: ['sequencedFengkouti', 'sequencedChangti', 'customSticker'] },
  { key: '贴纸包', label: '贴纸包', types: ['贴纸包'] },
  { key: '衍生贴纸', label: '衍生贴纸', types: ['封箱贴', '豆丁贴', 'gift贴'] },
  { key: '售后卡', label: '售后卡', types: ['售后卡'] },
  { key: '磨砂盒', label: '磨砂盒', types: ['磨砂盒'] },
  { key: '其他衍生', label: '其他衍生', types: ['customDerivative'] },
]

export default function LooseItemsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [products, setProducts] = useState<LooseItemProduct[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategories, setSelectedCategories] = useState<Set<CategoryKey>>(() => {
    // Initialize from URL params
    const categoriesParam = searchParams.get('categories')
    if (categoriesParam) {
      return new Set(categoriesParam.split(',') as CategoryKey[])
    }
    return new Set()
  })

  useEffect(() => {
    const loadProducts = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const data = await productApi.getLooseItems()
        setProducts(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败')
      } finally {
        setIsLoading(false)
      }
    }

    loadProducts()
  }, [])

  const toggleCategory = (categoryKey: CategoryKey) => {
    setSelectedCategories(prev => {
      const next = new Set(prev)
      if (next.has(categoryKey)) {
        next.delete(categoryKey)
      } else {
        next.add(categoryKey)
      }

      // Update URL params
      if (next.size > 0) {
        setSearchParams({ categories: Array.from(next).join(',') })
      } else {
        setSearchParams({})
      }

      return next
    })
  }

  const filteredProducts = useMemo(() => {
    if (selectedCategories.size === 0) {
      return products
    }

    return products.filter(product => {
      // Check if product has any quantity in selected categories
      for (const categoryKey of selectedCategories) {
        const category = CATEGORIES.find(c => c.key === categoryKey)
        if (category) {
          const hasQuantity = category.types.some(type => {
            if (type === 'customSticker') {
              return Object.keys(product.其他贴纸).length > 0
            } else if (type === 'customDerivative') {
              return Object.keys(product.其他衍生).length > 0
            } else if (type === 'sequencedKatou') {
              return Object.keys(product.卡头).length > 0
            } else if (type === 'sequencedFengkouti') {
              return Object.keys(product.封口贴).length > 0
            } else if (type === 'sequencedChangti') {
              return Object.keys(product.长贴).length > 0
            } else {
              const value = product[type as keyof LooseItemProduct]
              return typeof value === 'number' && value > 0
            }
          })
          if (hasQuantity) return true
        }
      }
      return false
    })
  }, [products, selectedCategories])

  const getProductQuantities = (product: LooseItemProduct): Array<{ label: string; quantity: number }> => {
    const quantities: Array<{ label: string; quantity: number }> = []

    const typeLabels: Record<string, string> = {
      折页: '折页',
      异形折页: '异形折页',
      卡背: '卡背',
      贴纸包: '贴纸包',
      封箱贴: '封箱贴',
      豆丁贴: '豆丁贴',
      gift贴: 'gift贴',
      售后卡: '售后卡',
      磨砂盒: '磨砂盒',
    }

    // If no categories selected, show all quantities
    if (selectedCategories.size === 0) {
      // Standard types
      for (const [key, label] of Object.entries(typeLabels)) {
        const value = product[key as keyof LooseItemProduct]
        if (typeof value === 'number' && value > 0) {
          quantities.push({ label, quantity: value })
        }
      }
      // Sequenced types - 卡头
      for (const [seqNum, quantity] of Object.entries(product.卡头)) {
        if (quantity > 0) {
          quantities.push({ label: `卡头${seqNum}`, quantity })
        }
      }
      // Sequenced types - 封口贴
      for (const [seqNum, quantity] of Object.entries(product.封口贴)) {
        if (quantity > 0) {
          quantities.push({ label: `封口贴${seqNum}`, quantity })
        }
      }
      // Sequenced types - 长贴
      for (const [seqNum, quantity] of Object.entries(product.长贴)) {
        if (quantity > 0) {
          quantities.push({ label: `长贴${seqNum}`, quantity })
        }
      }
      // Custom stickers
      for (const [key, quantity] of Object.entries(product.其他贴纸)) {
        if (quantity > 0) {
          // Parse "customType_seqNum" format
          const lastUnderscore = key.lastIndexOf('_')
          if (lastUnderscore > 0) {
            const customName = key.substring(0, lastUnderscore)
            const seqNum = key.substring(lastUnderscore + 1)
            quantities.push({ label: `${customName}${seqNum}`, quantity })
          } else {
            quantities.push({ label: key, quantity })
          }
        }
      }
      // Custom derivatives
      for (const [key, quantity] of Object.entries(product.其他衍生)) {
        if (quantity > 0) {
          // Parse "customType_seqNum" format
          const lastUnderscore = key.lastIndexOf('_')
          if (lastUnderscore > 0) {
            const customName = key.substring(0, lastUnderscore)
            const seqNum = key.substring(lastUnderscore + 1)
            quantities.push({ label: `${customName}${seqNum}`, quantity })
          } else {
            quantities.push({ label: key, quantity })
          }
        }
      }
    } else {
      // Only show quantities for selected categories
      for (const categoryKey of selectedCategories) {
        const category = CATEGORIES.find(c => c.key === categoryKey)
        if (category) {
          for (const type of category.types) {
            if (type === 'customSticker') {
              // Show all custom stickers
              for (const [key, quantity] of Object.entries(product.其他贴纸)) {
                if (quantity > 0) {
                  // Parse "customType_seqNum" format
                  const lastUnderscore = key.lastIndexOf('_')
                  if (lastUnderscore > 0) {
                    const customName = key.substring(0, lastUnderscore)
                    const seqNum = key.substring(lastUnderscore + 1)
                    quantities.push({ label: `${customName}${seqNum}`, quantity })
                  } else {
                    quantities.push({ label: key, quantity })
                  }
                }
              }
            } else if (type === 'customDerivative') {
              // Show all custom derivatives
              for (const [key, quantity] of Object.entries(product.其他衍生)) {
                if (quantity > 0) {
                  // Parse "customType_seqNum" format
                  const lastUnderscore = key.lastIndexOf('_')
                  if (lastUnderscore > 0) {
                    const customName = key.substring(0, lastUnderscore)
                    const seqNum = key.substring(lastUnderscore + 1)
                    quantities.push({ label: `${customName}${seqNum}`, quantity })
                  } else {
                    quantities.push({ label: key, quantity })
                  }
                }
              }
            } else if (type === 'sequencedKatou') {
              // Show all 卡头 with sequence numbers
              for (const [seqNum, quantity] of Object.entries(product.卡头)) {
                if (quantity > 0) {
                  quantities.push({ label: `卡头${seqNum}`, quantity })
                }
              }
            } else if (type === 'sequencedFengkouti') {
              // Show all 封口贴 with sequence numbers
              for (const [seqNum, quantity] of Object.entries(product.封口贴)) {
                if (quantity > 0) {
                  quantities.push({ label: `封口贴${seqNum}`, quantity })
                }
              }
            } else if (type === 'sequencedChangti') {
              // Show all 长贴 with sequence numbers
              for (const [seqNum, quantity] of Object.entries(product.长贴)) {
                if (quantity > 0) {
                  quantities.push({ label: `长贴${seqNum}`, quantity })
                }
              }
            } else {
              const value = product[type as keyof LooseItemProduct]
              if (typeof value === 'number' && value > 0) {
                const label = typeLabels[type as string] || (type as string)
                quantities.push({ label, quantity: value })
              }
            }
          }
        }
      }
    }

    return quantities
  }

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">加载中...</div>
  }

  if (error) {
    return <div className="text-center py-12 text-red-500">{error}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">散件商品浏览</h1>
        <span className="text-gray-600">
          {selectedCategories.size > 0
            ? `已筛选 ${filteredProducts.length} 件商品`
            : `共 ${products.length} 件商品`}
        </span>
      </div>

      {/* Category filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(category => (
            <button
              key={category.key}
              onClick={() => toggleCategory(category.key)}
              className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                selectedCategories.has(category.key)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>
        {selectedCategories.size > 0 && (
          <button
            onClick={() => {
              setSelectedCategories(new Set())
              setSearchParams({})
            }}
            className="mt-3 text-sm text-blue-600 hover:text-blue-700"
          >
            清除所有筛选
          </button>
        )}
      </div>

      {filteredProducts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {selectedCategories.size > 0 ? '未找到符合筛选条件的商品' : '暂无散件商品'}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
          {filteredProducts.map((product) => {
            const quantities = getProductQuantities(product)

            // Build the link with source and categories
            const categoriesParam = selectedCategories.size > 0
              ? `&categories=${Array.from(selectedCategories).join(',')}`
              : ''
            const productLink = `/products/${product.productId}?from=loose-items${categoriesParam}`

            return (
              <Link
                key={product.productId}
                to={productLink}
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
                  <h3 className="font-medium text-gray-900 mb-1 line-clamp-2">
                    {product.productName}
                  </h3>
                  <p className="text-xs text-gray-500 mb-2 truncate">
                    {product.shopName}
                  </p>
                  <div className="space-y-1 text-sm">
                    {quantities.map((item, index) => (
                      <div key={index} className="flex justify-between">
                        <span className="text-gray-600">{item.label}:</span>
                        <span className="font-bold text-blue-600">{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
