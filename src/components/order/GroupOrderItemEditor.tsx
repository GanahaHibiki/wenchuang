import { useState, useEffect } from 'react'
import type { OrderItem, Product, Specification } from '@/types'
import { SPECIFICATION_TYPES } from '@/types'
import ImageUploader from '@/components/common/ImageUploader'

interface ShopItemsGroup {
  shopId: string
  shopName: string
  items: (OrderItem & { product: Product })[]
}

interface Props {
  shopGroups: ShopItemsGroup[]
  onSave: (updatedGroups: ShopItemsGroup[], newImages: Map<string, File>) => void
  onCancel: () => void
  existingProducts: Array<{
    productId: string
    productName: string
    imagePath: string
    thumbnailPath: string
  }>
}

export default function GroupOrderItemEditor({ shopGroups, onSave, onCancel, existingProducts }: Props) {
  const [editedGroups, setEditedGroups] = useState<ShopItemsGroup[]>(
    JSON.parse(JSON.stringify(shopGroups))
  )
  const [newImages, setNewImages] = useState<Map<string, File>>(new Map())
  const [expandedShops, setExpandedShops] = useState<Set<string>>(
    new Set(shopGroups.map(g => g.shopId))
  )

  const toggleShop = (shopId: string) => {
    const newExpanded = new Set(expandedShops)
    if (newExpanded.has(shopId)) {
      newExpanded.delete(shopId)
    } else {
      newExpanded.add(shopId)
    }
    setExpandedShops(newExpanded)
  }

  const updateShopName = (shopId: string, newName: string) => {
    setEditedGroups(prev => prev.map(group => {
      if (group.shopId !== shopId) return group
      return { ...group, shopName: newName }
    }))
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

      const newItem: OrderItem & { product: Product } = {
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
        }
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

    onSave(editedGroups, newImages)
  }

  const handleProductSelect = (shopId: string, itemIndex: number, productId: string) => {
    const product = existingProducts.find(p => p.productId === productId)
    if (product) {
      updateItem(shopId, itemIndex, {
        productId: product.productId,
        product: {
          id: product.productId,
          name: product.productName,
          imagePath: product.imagePath,
          thumbnailPath: product.thumbnailPath,
          createdAt: new Date().toISOString(),
        }
      })
    }
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
                  <input
                    type="text"
                    value={group.shopName}
                    onChange={(e) => updateShopName(group.shopId, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="px-3 py-1 border rounded-md text-md font-medium flex-1"
                    placeholder="店铺名称"
                  />
                  <span className="text-sm text-gray-600">({group.items.length} 件商品)</span>
                </div>
                <button
                  onClick={() => toggleShop(group.shopId)}
                  className="text-gray-600 hover:text-gray-800 px-2"
                >
                  {expandedShops.has(group.shopId) ? '▼' : '▶'}
                </button>
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
                            <label className="block text-sm font-medium mb-1">商品名称</label>
                            <input
                              type="text"
                              value={item.product.name}
                              onChange={(e) => updateItem(group.shopId, itemIndex, {
                                product: { ...item.product, name: e.target.value }
                              })}
                              list={`products-${group.shopId}-${itemIndex}`}
                              className="w-full px-3 py-2 border rounded-md"
                              placeholder="输入或选择商品名称"
                            />
                            <datalist id={`products-${group.shopId}-${itemIndex}`}>
                              {existingProducts.map((p) => (
                                <option key={p.productId} value={p.productName} />
                              ))}
                            </datalist>
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
        </div>
      </div>
    </div>
  )
}
