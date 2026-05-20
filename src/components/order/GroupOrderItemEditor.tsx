import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import type { OrderItem, Product, Specification, Shop } from '@/types'
import { SPECIFICATION_TYPES } from '@/types'
import ImageUploader from '@/components/common/ImageUploader'
import { wishApi, type WishProduct } from '@/api/client'

interface ShopItemsGroup {
  shopId: string
  shopName: string
  items: (OrderItem & { product: Product; isFromWish?: boolean })[]
}

interface ExistingProduct {
  productId: string
  productName: string
  shopName: string
  imagePath: string
  thumbnailPath: string
}

interface Props {
  shopGroups: ShopItemsGroup[]
  onSave: (updatedGroups: ShopItemsGroup[], newImages: Map<string, File>, wishProductsToDelete: Array<{ shopName: string; productName: string }>) => void
  onCancel: () => void
  existingProducts: ExistingProduct[]
  existingShops?: Shop[]
}

export default function GroupOrderItemEditor({ shopGroups, onSave, onCancel, existingProducts, existingShops = [] }: Props) {
  const [editedGroups, setEditedGroups] = useState<ShopItemsGroup[]>(
    JSON.parse(JSON.stringify(shopGroups))
  )
  const [newImages, setNewImages] = useState<Map<string, File>>(new Map())
  const [expandedShops, setExpandedShops] = useState<Set<string>>(
    new Set(shopGroups.map(g => g.shopId))
  )
  // Track which shops have confirmed names (dropdown closed)
  const [confirmedShops, setConfirmedShops] = useState<Set<string>>(
    new Set(shopGroups.filter(g => g.shopName).map(g => g.shopId))
  )
  // Track shop dropdown visibility
  const [showShopDropdown, setShowShopDropdown] = useState<string | null>(null)
  // Cache wish products by shop name
  const [wishProductsCache, setWishProductsCache] = useState<Record<string, WishProduct[]>>({})
  // Track which items came from wish products for deletion after save
  const [wishItemsToDelete, setWishItemsToDelete] = useState<Array<{ shopName: string; productName: string }>>([])

  // Load wish products for a shop when confirmed
  const loadWishProductsForShop = async (shopName: string) => {
    if (!shopName || wishProductsCache[shopName]) return
    try {
      const wishes = await wishApi.getByShop(shopName)
      setWishProductsCache(prev => ({ ...prev, [shopName]: wishes }))
    } catch (error) {
      console.error('Failed to load wish products:', error)
    }
  }

  // Load wish products when shop is confirmed
  useEffect(() => {
    confirmedShops.forEach(shopId => {
      const group = editedGroups.find(g => g.shopId === shopId)
      if (group?.shopName) {
        loadWishProductsForShop(group.shopName)
      }
    })
  }, [confirmedShops, editedGroups])

  const toggleShop = (shopId: string) => {
    const newExpanded = new Set(expandedShops)
    if (newExpanded.has(shopId)) {
      newExpanded.delete(shopId)
    } else {
      newExpanded.add(shopId)
    }
    setExpandedShops(newExpanded)
  }

  const updateShopName = (oldShopId: string, newName: string) => {
    // Check if the new name matches an existing shop
    const existingShop = existingShops.find(s => s.name === newName)

    if (existingShop && existingShop.id !== oldShopId) {
      // User selected an existing shop - update shopId for the group and all its items
      const newShopId = existingShop.id

      setEditedGroups(prev => prev.map(group => {
        if (group.shopId !== oldShopId) return group
        return {
          ...group,
          shopId: newShopId,
          shopName: newName,
          items: group.items.map(item => ({
            ...item,
            shopId: newShopId
          }))
        }
      }))

      // Update expandedShops set
      setExpandedShops(prev => {
        const next = new Set(prev)
        next.delete(oldShopId)
        next.add(newShopId)
        return next
      })

      // Update confirmedShops set
      setConfirmedShops(prev => {
        const next = new Set(prev)
        next.delete(oldShopId)
        next.add(newShopId)
        return next
      })

      // Load wish products for this shop
      loadWishProductsForShop(newName)
    } else {
      // Just update the name (new shop or same shop)
      setEditedGroups(prev => prev.map(group => {
        if (group.shopId !== oldShopId) return group
        return { ...group, shopName: newName }
      }))
    }
  }

  const confirmShopName = (shopId: string) => {
    const group = editedGroups.find(g => g.shopId === shopId)
    if (group?.shopName) {
      setConfirmedShops(prev => new Set([...prev, shopId]))
      setShowShopDropdown(null)
      loadWishProductsForShop(group.shopName)
    }
  }

  const handleShopSelect = (shopId: string, shopName: string) => {
    updateShopName(shopId, shopName)
    setShowShopDropdown(null)
  }

  const handleShopInputBlur = (shopId: string) => {
    // Delay to allow click on dropdown item
    setTimeout(() => {
      const group = editedGroups.find(g => g.shopId === shopId)
      if (group?.shopName) {
        confirmShopName(shopId)
      }
      setShowShopDropdown(null)
    }, 200)
  }

  const updateItem = (shopId: string, itemIndex: number, updates: Partial<OrderItem & { product: Product }>) => {
    setEditedGroups(prev => prev.map(group => {
      if (group.shopId !== shopId) return group

      const newItems = [...group.items]
      newItems[itemIndex] = { ...newItems[itemIndex], ...updates }
      return { ...group, items: newItems }
    }))
  }

  const addItem = (shopId: string) => {
    setEditedGroups(prev => prev.map(group => {
      if (group.shopId !== shopId) return group

      const newItem: OrderItem & { product: Product; isFromWish?: boolean } = {
        id: `temp_${Date.now()}`,
        productId: '',
        category: 'purchased',
        specifications: [],
        shopId,
        product: {
          id: '',
          name: '',
          imagePath: '',
          thumbnailPath: '',
          createdAt: new Date().toISOString(),
        },
        isFromWish: false
      }

      return { ...group, items: [...group.items, newItem] }
    }))
  }

  const removeItem = (shopId: string, itemIndex: number) => {
    setEditedGroups(prev => prev.map(group => {
      if (group.shopId !== shopId) return group

      const newItems = group.items.filter((_, i) => i !== itemIndex)
      return { ...group, items: newItems }
    }))
  }

  const addShop = () => {
    const newShopId = uuidv4()
    const newItemId = `temp_${Date.now()}`
    const newGroup: ShopItemsGroup = {
      shopId: newShopId,
      shopName: '',
      items: [{
        id: newItemId,
        productId: '',
        category: 'purchased',
        specifications: [],
        shopId: newShopId,
        product: {
          id: '',
          name: '',
          imagePath: '',
          thumbnailPath: '',
          createdAt: new Date().toISOString(),
        },
        isFromWish: false
      }]
    }
    setEditedGroups(prev => [...prev, newGroup])
    setExpandedShops(prev => new Set([...prev, newShopId]))
    // Don't mark as confirmed - user needs to enter/select shop name first
  }

  const removeShop = (shopId: string) => {
    if (!confirm('确定要删除这个店铺及其所有商品吗？')) return
    setEditedGroups(prev => prev.filter(g => g.shopId !== shopId))
    setExpandedShops(prev => {
      const next = new Set(prev)
      next.delete(shopId)
      return next
    })
    setConfirmedShops(prev => {
      const next = new Set(prev)
      next.delete(shopId)
      return next
    })
  }

  const handleImageChange = (itemId: string, file: File | null) => {
    if (file) {
      setNewImages(prev => {
        const next = new Map(prev)
        next.set(itemId, file)
        return next
      })
    } else {
      setNewImages(prev => {
        const next = new Map(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  const addSpecification = (shopId: string, itemIndex: number) => {
    const newSpec: Specification = {
      type: '徽章',
      quantity: 1,
      purchasePrice: 0,
      originalPrice: 0,
    }

    const item = editedGroups.find(g => g.shopId === shopId)?.items[itemIndex]
    if (item) {
      updateItem(shopId, itemIndex, {
        specifications: [...item.specifications, newSpec]
      })
    }
  }

  const updateSpecification = (shopId: string, itemIndex: number, specIndex: number, updates: Partial<Specification>) => {
    const item = editedGroups.find(g => g.shopId === shopId)?.items[itemIndex]
    if (item) {
      const newSpecs = [...item.specifications]
      newSpecs[specIndex] = { ...newSpecs[specIndex], ...updates }
      updateItem(shopId, itemIndex, { specifications: newSpecs })
    }
  }

  const removeSpecification = (shopId: string, itemIndex: number, specIndex: number) => {
    const item = editedGroups.find(g => g.shopId === shopId)?.items[itemIndex]
    if (item) {
      const newSpecs = item.specifications.filter((_, i) => i !== specIndex)
      updateItem(shopId, itemIndex, { specifications: newSpecs })
    }
  }

  const handleSave = () => {
    // Validate all items
    for (const group of editedGroups) {
      for (const item of group.items) {
        if (!item.product.name.trim()) {
          alert(`店铺"${group.shopName}"有商品名称为空`)
          return
        }
        if (!item.productId && !newImages.has(item.id)) {
          alert(`店铺"${group.shopName}"的商品"${item.product.name}"需要上传图片`)
          return
        }
        if (item.specifications.length === 0) {
          alert(`店铺"${group.shopName}"的商品"${item.product.name}"至少需要一个规格`)
          return
        }
      }
    }

    // Collect wish products that need to be deleted
    const wishesToDelete: Array<{ shopName: string; productName: string }> = []
    for (const group of editedGroups) {
      for (const item of group.items) {
        if (item.isFromWish && group.shopName && item.product.name) {
          wishesToDelete.push({
            shopName: group.shopName,
            productName: item.product.name
          })
        }
      }
    }

    onSave(editedGroups, newImages, wishesToDelete)
  }

  const handleProductSelect = (shopId: string, itemIndex: number, selection: string) => {
    const group = editedGroups.find(g => g.shopId === shopId)
    if (!group) return

    if (selection === 'manual') {
      // Clear selection for manual input
      updateItem(shopId, itemIndex, {
        productId: '',
        product: {
          id: '',
          name: '',
          imagePath: '',
          thumbnailPath: '',
          createdAt: new Date().toISOString(),
        },
        isFromWish: false
      })
      return
    }

    // Check if it's a wish product (prefixed with 'wish_')
    if (selection.startsWith('wish_')) {
      const wishId = selection.replace('wish_', '')
      const wishes = wishProductsCache[group.shopName] || []
      const wish = wishes.find(w => w.id === wishId)
      if (wish) {
        updateItem(shopId, itemIndex, {
          productId: '', // New product from wish
          product: {
            id: '',
            name: wish.productName,
            imagePath: wish.imagePath,
            thumbnailPath: wish.thumbnailPath,
            createdAt: new Date().toISOString(),
          },
          isFromWish: true
        })
      }
      return
    }

    // Check if it's from shop products
    const shopProducts = existingProducts.filter(p => p.shopName === group.shopName)
    const product = shopProducts.find(p => p.productId === selection)
    if (product) {
      updateItem(shopId, itemIndex, {
        productId: product.productId,
        product: {
          id: product.productId,
          name: product.productName,
          imagePath: product.imagePath,
          thumbnailPath: product.thumbnailPath,
          createdAt: new Date().toISOString(),
        },
        isFromWish: false
      })
    }
  }

  // Get filtered shop list based on input
  const getFilteredShops = (shopName: string) => {
    return existingShops.filter(shop =>
      shop.name.toLowerCase().includes(shopName.toLowerCase())
    )
  }

  // Get products for a specific shop (including wish products)
  const getShopProducts = (shopName: string) => {
    const shopProducts = existingProducts.filter(p => p.shopName === shopName)
    const wishes = wishProductsCache[shopName] || []
    return { shopProducts, wishes }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">编辑拼单订单</h2>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              保存
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {editedGroups.map((group) => (
            <div key={group.shopId} className="border rounded-lg overflow-hidden">
              <div
                className="bg-gray-100 px-4 py-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3 flex-1">
                  <span className="text-sm text-gray-600">店铺：</span>
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={group.shopName}
                      onChange={(e) => updateShopName(group.shopId, e.target.value)}
                      onFocus={() => setShowShopDropdown(group.shopId)}
                      onBlur={() => handleShopInputBlur(group.shopId)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full px-3 py-1 border rounded-md text-md font-medium"
                      placeholder="输入或选择店铺名"
                    />
                    {showShopDropdown === group.shopId && getFilteredShops(group.shopName).length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {getFilteredShops(group.shopName).map(shop => (
                          <div
                            key={shop.id}
                            className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                            onClick={() => handleShopSelect(group.shopId, shop.name)}
                          >
                            {shop.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-sm text-gray-600">({group.items.length} 件商品)</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => removeShop(group.shopId)}
                    className="text-red-500 hover:text-red-700 px-2 text-sm"
                    title="删除店铺"
                  >
                    删除店铺
                  </button>
                  <button
                    onClick={() => toggleShop(group.shopId)}
                    className="text-gray-600 hover:text-gray-800 px-2"
                  >
                    {expandedShops.has(group.shopId) ? '▼' : '▶'}
                  </button>
                </div>
              </div>

              {expandedShops.has(group.shopId) && (
                <div className="p-4 space-y-4">
                  {group.items.map((item, itemIndex) => (
                    <div key={item.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start gap-4">
                        {/* Image */}
                        <div className="flex-shrink-0 w-32">
                          <div className="w-32 h-24 bg-gray-200 rounded overflow-hidden mb-2">
                            {(newImages.has(item.id) || item.product.imagePath) && (
                              <img
                                src={
                                  newImages.has(item.id)
                                    ? URL.createObjectURL(newImages.get(item.id)!)
                                    : `/images/thumbnails/${item.product.thumbnailPath}`
                                }
                                alt={item.product.name}
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          <ImageUploader
                            onImageSelect={(file) => handleImageChange(item.id, file)}
                            preview={null}
                            enableClipboard={true}
                            compact={true}
                          />
                        </div>

                        {/* Product name */}
                        <div className="flex-1 space-y-2">
                          <div>
                            <label className="block text-sm font-medium mb-1">选择商品</label>
                            {confirmedShops.has(group.shopId) ? (
                              <>
                                <select
                                  onChange={(e) => handleProductSelect(group.shopId, itemIndex, e.target.value)}
                                  value={item.productId || (item.isFromWish ? `wish_${item.product.name}` : 'manual')}
                                  className="w-full px-3 py-2 border rounded-md mb-2"
                                >
                                  <option value="manual">手动输入商品名和图片</option>
                                  {(() => {
                                    const { shopProducts, wishes } = getShopProducts(group.shopName)
                                    return (
                                      <>
                                        {wishes.length > 0 && (
                                          <optgroup label="心愿商品">
                                            {wishes.map((wish) => (
                                              <option key={`wish_${wish.id}`} value={`wish_${wish.id}`}>
                                                {wish.productName}
                                              </option>
                                            ))}
                                          </optgroup>
                                        )}
                                        {shopProducts.length > 0 && (
                                          <optgroup label="同店铺商品">
                                            {shopProducts.map((product) => (
                                              <option key={product.productId} value={product.productId}>
                                                {product.productName}
                                              </option>
                                            ))}
                                          </optgroup>
                                        )}
                                      </>
                                    )
                                  })()}
                                </select>
                                <label className="block text-sm font-medium mb-1">商品名称</label>
                                <input
                                  type="text"
                                  value={item.product.name}
                                  onChange={(e) => {
                                    updateItem(group.shopId, itemIndex, {
                                      product: { ...item.product, name: e.target.value },
                                      isFromWish: false
                                    })
                                  }}
                                  className="w-full px-3 py-2 border rounded-md"
                                  placeholder="输入商品名称"
                                />
                              </>
                            ) : (
                              <div className="text-sm text-gray-500 py-2">
                                请先确认店铺名称后再选择商品
                              </div>
                            )}
                          </div>

                          {/* Specifications */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-sm font-medium">规格明细</label>
                              <button
                                onClick={() => addSpecification(group.shopId, itemIndex)}
                                className="text-sm text-blue-600 hover:text-blue-700"
                              >
                                + 添加规格
                              </button>
                            </div>
                            <div className="space-y-2">
                              {item.specifications.map((spec, specIndex) => (
                                <div key={specIndex} className="flex items-center gap-2 text-sm">
                                  <select
                                    value={spec.type}
                                    onChange={(e) => updateSpecification(group.shopId, itemIndex, specIndex, {
                                      type: e.target.value
                                    })}
                                    className="px-2 py-1 border rounded"
                                  >
                                    {SPECIFICATION_TYPES.map(type => (
                                      <option key={type} value={type}>{type}</option>
                                    ))}
                                  </select>
                                  {(spec.type === '其他衍生' || spec.type === '其他贴纸') && (
                                    <input
                                      type="text"
                                      value={spec.customType || ''}
                                      onChange={(e) => updateSpecification(group.shopId, itemIndex, specIndex, {
                                        customType: e.target.value
                                      })}
                                      placeholder="自定义类型"
                                      className="px-2 py-1 border rounded w-24"
                                    />
                                  )}
                                  <input
                                    type="number"
                                    value={spec.quantity}
                                    onChange={(e) => updateSpecification(group.shopId, itemIndex, specIndex, {
                                      quantity: parseInt(e.target.value) || 0
                                    })}
                                    className="w-16 px-2 py-1 border rounded"
                                    placeholder="数量"
                                  />
                                  <span>个 ×</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={spec.purchasePrice || 0}
                                    onChange={(e) => updateSpecification(group.shopId, itemIndex, specIndex, {
                                      purchasePrice: parseFloat(e.target.value) || 0
                                    })}
                                    className="w-20 px-2 py-1 border rounded"
                                    placeholder="购买单价"
                                  />
                                  <span>/</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={spec.originalPrice || 0}
                                    onChange={(e) => updateSpecification(group.shopId, itemIndex, specIndex, {
                                      originalPrice: parseFloat(e.target.value) || 0
                                    })}
                                    className="w-20 px-2 py-1 border rounded"
                                    placeholder="原价"
                                  />
                                  <span>
                                    = ¥{((spec.quantity * (spec.purchasePrice || 0)).toFixed(2))}
                                  </span>
                                  <button
                                    onClick={() => removeSpecification(group.shopId, itemIndex, specIndex)}
                                    className="text-red-600 hover:text-red-700 ml-2"
                                  >
                                    删除
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Remove item button */}
                        <button
                          onClick={() => removeItem(group.shopId, itemIndex)}
                          className="text-red-600 hover:text-red-700 text-sm"
                        >
                          删除商品
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={() => addItem(group.shopId)}
                    className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600"
                  >
                    + 添加商品
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Add new shop button */}
          <button
            onClick={addShop}
            className="w-full py-3 border-2 border-dashed border-green-300 rounded-lg text-green-600 hover:border-green-500 hover:text-green-700 hover:bg-green-50 font-medium"
          >
            + 添加新店铺
          </button>
        </div>
      </div>
    </div>
  )
}
