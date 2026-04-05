import { useState, useEffect } from 'react'
import type { OrderItem, Product, Specification, GiftType } from '@/types'
import { SPECIFICATION_TYPES, GIFT_TYPES, MULTI_ENTRY_TYPES } from '@/types'
import { productApi } from '@/api/client'
import ImageUploader from '@/components/common/ImageUploader'

interface OrderItemEditorProps {
  items: (OrderItem & { product: Product })[]
  category: 'purchased' | 'gift' | 'smallGift'
  onSave: (items: (OrderItem & { product: Product })[], newImages: Map<string, File>) => void
  onCancel: () => void
  shopName: string
  existingProducts: {
    productId: string
    productName: string
    imagePath: string
    thumbnailPath: string
  }[]
}

export default function OrderItemEditor({
  items,
  category,
  onSave,
  onCancel,
  shopName,
  existingProducts
}: OrderItemEditorProps) {
  const [editedItems, setEditedItems] = useState(items)
  const [newImages, setNewImages] = useState<Map<string, File>>(new Map())
  const [imagePreviews, setImagePreviews] = useState<Map<string, string>>(new Map())
  const [shopProducts, setShopProducts] = useState<Product[]>([])
  const [isLoadingShopProducts, setIsLoadingShopProducts] = useState(false)

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      imagePreviews.forEach(url => URL.revokeObjectURL(url))
    }
  }, [imagePreviews])

  // Load shop products
  useEffect(() => {
    const loadShopProducts = async () => {
      if (!shopName) return

      setIsLoadingShopProducts(true)
      try {
        const products = await productApi.search('shopName', shopName)
        setShopProducts(products)
      } catch (error) {
        console.error('Failed to load shop products:', error)
      } finally {
        setIsLoadingShopProducts(false)
      }
    }

    loadShopProducts()
  }, [shopName])

  const handleSelectProduct = (index: number, selection: string) => {
    if (selection === 'manual') {
      // Don't change anything, user will input manually
      return
    }

    // Check if it's from existing products
    const existingProduct = existingProducts.find((item, idx) => `existing-${idx}` === selection)
    if (existingProduct) {
      const newItems = [...editedItems]
      newItems[index] = {
        ...newItems[index],
        productId: existingProduct.productId,
        product: {
          ...newItems[index].product,
          id: existingProduct.productId,
          name: existingProduct.productName,
          imagePath: existingProduct.imagePath,
          thumbnailPath: existingProduct.thumbnailPath
        }
      }
      setEditedItems(newItems)

      // Set image preview using the existing product's image path
      const itemId = newItems[index].id
      setImagePreviews(prev => new Map(prev).set(itemId, `/images/original/${existingProduct.imagePath}`))
      return
    }

    // Check if it's from shop products
    const product = shopProducts.find(p => p.id === selection)
    if (product) {
      const newItems = [...editedItems]
      newItems[index] = {
        ...newItems[index],
        productId: product.id,
        product: {
          ...newItems[index].product,
          id: product.id,
          name: product.name,
          imagePath: product.imagePath,
          thumbnailPath: product.thumbnailPath
        }
      }
      setEditedItems(newItems)

      const itemId = newItems[index].id
      setImagePreviews(prev => new Map(prev).set(itemId, `/images/original/${product.imagePath}`))
    }
  }

  const updateItemName = (index: number, name: string) => {
    const newItems = [...editedItems]
    newItems[index] = {
      ...newItems[index],
      product: { ...newItems[index].product, name }
    }
    setEditedItems(newItems)
  }

  const updateItemImage = (index: number, file: File) => {
    const itemId = editedItems[index].id
    setNewImages(prev => new Map(prev).set(itemId, file))

    // Create preview URL
    const previewUrl = URL.createObjectURL(file)
    setImagePreviews(prev => new Map(prev).set(itemId, previewUrl))
  }

  const updateItemGiftType = (index: number, giftType: GiftType) => {
    const newItems = [...editedItems]
    newItems[index] = { ...newItems[index], giftType }
    setEditedItems(newItems)
  }

  const updateSpecification = (itemIndex: number, specIndex: number, field: keyof Specification, value: any) => {
    const newItems = [...editedItems]
    const specs = [...newItems[itemIndex].specifications]
    specs[specIndex] = { ...specs[specIndex], [field]: value }
    newItems[itemIndex] = { ...newItems[itemIndex], specifications: specs }
    setEditedItems(newItems)
  }

  const addSpecification = (itemIndex: number) => {
    const newItems = [...editedItems]
    const specs = [...newItems[itemIndex].specifications]

    // For new spec, use default type and sequence number 1
    const newSpec: Specification = {
      type: '试吃set',
      sequenceNumber: 1,
      quantity: 0,
      purchasePrice: category === 'purchased' ? 0 : undefined,
      originalPrice: 0
    }

    specs.push(newSpec)
    newItems[itemIndex] = { ...newItems[itemIndex], specifications: specs }
    setEditedItems(newItems)
  }

  const addMultiEntrySpec = (itemIndex: number, type: string) => {
    const newItems = [...editedItems]
    const specs = [...newItems[itemIndex].specifications]

    // Find max sequence number for this type
    const sameTypeSpecs = specs.filter(s => s.type === type)
    const maxSeq = sameTypeSpecs.length > 0
      ? Math.max(...sameTypeSpecs.map(s => s.sequenceNumber))
      : 0

    const newSpec: Specification = {
      type: type as any,
      sequenceNumber: maxSeq + 1,
      quantity: 0,
      purchasePrice: category === 'purchased' ? 0 : undefined,
      originalPrice: 0
    }

    specs.push(newSpec)
    newItems[itemIndex] = { ...newItems[itemIndex], specifications: specs }
    setEditedItems(newItems)
  }

  const removeSpecification = (itemIndex: number, specIndex: number) => {
    const newItems = [...editedItems]
    const specs = newItems[itemIndex].specifications.filter((_, i) => i !== specIndex)
    newItems[itemIndex] = { ...newItems[itemIndex], specifications: specs }
    setEditedItems(newItems)
  }

  const removeItem = (index: number) => {
    const itemId = editedItems[index].id

    // Clean up preview URL if exists
    const previewUrl = imagePreviews.get(itemId)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    // Remove the image and preview
    const updatedImages = new Map(newImages)
    updatedImages.delete(itemId)
    setNewImages(updatedImages)

    const updatedPreviews = new Map(imagePreviews)
    updatedPreviews.delete(itemId)
    setImagePreviews(updatedPreviews)

    setEditedItems(editedItems.filter((_, i) => i !== index))
  }

  const addNewItem = () => {
    const newItem: OrderItem & { product: Product } = {
      id: `new_${Date.now()}`,
      productId: '',
      category,
      giftType: category === 'gift' ? '满赠礼' : undefined,
      specifications: [{
        type: '试吃set',
        sequenceNumber: 1,
        quantity: 0,
        purchasePrice: category === 'purchased' ? 0 : undefined,
        originalPrice: 0
      }],
      product: {
        id: '',
        name: '',
        imagePath: '',
        thumbnailPath: '',
        createdAt: new Date().toISOString()
      }
    }
    setEditedItems([...editedItems, newItem])
  }

  // Filter out products already used in edited items
  const usedProductNames = new Set(editedItems.map(item => item.product.name.trim().toLowerCase()))
  const availableExistingProducts = existingProducts.filter(
    product => !usedProductNames.has(product.productName.trim().toLowerCase())
  )
  const availableShopProducts = shopProducts.filter(
    product => !usedProductNames.has(product.name.trim().toLowerCase())
  )

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold">
            编辑{category === 'purchased' ? '已购商品' : category === 'gift' ? '礼品' : '小礼物'}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {editedItems.map((item, itemIndex) => (
            <div key={item.id} className="border rounded-lg p-4 space-y-4">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 space-y-3">
                  {/* Product Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      选择商品
                    </label>
                    <select
                      onChange={(e) => handleSelectProduct(itemIndex, e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      defaultValue="manual"
                    >
                      <option value="manual">手动输入商品名和图片</option>
                      {availableExistingProducts.length > 0 && (
                        <optgroup label="本订单已录入商品">
                          {availableExistingProducts.map((product, idx) => {
                            const originalIdx = existingProducts.indexOf(product)
                            return (
                              <option key={`existing-${originalIdx}`} value={`existing-${originalIdx}`}>
                                {product.productName}
                              </option>
                            )
                          })}
                        </optgroup>
                      )}
                      {availableShopProducts.length > 0 && (
                        <optgroup label="同店铺商品">
                          {availableShopProducts.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  {/* Product Image */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      商品图片
                    </label>
                    <ImageUploader
                      onImageSelect={(file) => updateItemImage(itemIndex, file)}
                      preview={
                        imagePreviews.get(item.id) ||
                        (item.product.imagePath ? `/images/original/${item.product.imagePath}` : null)
                      }
                      enableClipboard={true}
                    />
                  </div>

                  {/* Product Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      商品名称
                    </label>
                    <input
                      type="text"
                      value={item.product.name}
                      onChange={(e) => updateItemName(itemIndex, e.target.value)}
                      className="w-full px-3 py-2 border rounded-md"
                      placeholder="请输入商品名称"
                    />
                  </div>

                  {/* Gift Type (only for gifts) */}
                  {category === 'gift' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        礼品类型
                      </label>
                      <select
                        value={item.giftType || '满赠礼'}
                        onChange={(e) => updateItemGiftType(itemIndex, e.target.value as GiftType)}
                        className="w-full px-3 py-2 border rounded-md"
                      >
                        {GIFT_TYPES.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Specifications */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-gray-700">
                        规格
                      </label>
                      <button
                        onClick={() => addSpecification(itemIndex)}
                        className="text-sm text-blue-600 hover:text-blue-700"
                      >
                        + 添加规格
                      </button>
                    </div>
                    <div className="space-y-2">
                      {item.specifications.map((spec, specIndex) => {
                        const isMultiEntry = MULTI_ENTRY_TYPES.includes(spec.type as any)

                        return (
                          <div key={specIndex} className="flex gap-2 items-start bg-gray-50 p-3 rounded">
                            <div className="flex-1 grid grid-cols-2 gap-2">
                              {/* Type selector */}
                              <div className="col-span-2">
                                <label className="text-xs text-gray-600">类型</label>
                                <select
                                  value={spec.type}
                                  onChange={(e) => updateSpecification(itemIndex, specIndex, 'type', e.target.value)}
                                  className="w-full px-2 py-1 border rounded text-sm"
                                >
                                  {SPECIFICATION_TYPES.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                              </div>

                              {isMultiEntry && (
                                <div>
                                  <label className="text-xs text-gray-600">序号</label>
                                  <input
                                    type="number"
                                    min="1"
                                    value={spec.sequenceNumber}
                                    onChange={(e) => updateSpecification(itemIndex, specIndex, 'sequenceNumber', parseInt(e.target.value) || 1)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                  />
                                </div>
                              )}

                              {(spec.type === '其他衍生' || spec.type === '其他贴纸') && (
                                <div className={isMultiEntry ? '' : 'col-span-2'}>
                                  <label className="text-xs text-gray-600">自定义名称</label>
                                  <input
                                    type="text"
                                    value={spec.customType || ''}
                                    onChange={(e) => updateSpecification(itemIndex, specIndex, 'customType', e.target.value)}
                                    placeholder="输入类别名称"
                                    className="w-full px-2 py-1 border rounded text-sm"
                                  />
                                </div>
                              )}

                              <div>
                                <label className="text-xs text-gray-600">数量</label>
                                <input
                                  type="number"
                                  value={spec.quantity}
                                  onChange={(e) => updateSpecification(itemIndex, specIndex, 'quantity', parseInt(e.target.value) || 0)}
                                  className="w-full px-2 py-1 border rounded text-sm"
                                />
                              </div>

                              {category === 'purchased' && (
                                <div>
                                  <label className="text-xs text-gray-600">购入价</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={spec.purchasePrice || 0}
                                    onChange={(e) => updateSpecification(itemIndex, specIndex, 'purchasePrice', parseFloat(e.target.value) || 0)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                  />
                                </div>
                              )}

                              <div>
                                <label className="text-xs text-gray-600">原价</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={spec.originalPrice}
                                  onChange={(e) => updateSpecification(itemIndex, specIndex, 'originalPrice', parseFloat(e.target.value) || 0)}
                                  className="w-full px-2 py-1 border rounded text-sm"
                                />
                              </div>
                            </div>

                            <button
                              onClick={() => removeSpecification(itemIndex, specIndex)}
                              className="text-red-600 hover:text-red-700 mt-5"
                            >
                              ✕
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Remove Item Button */}
                <button
                  onClick={() => removeItem(itemIndex)}
                  className="ml-4 text-red-600 hover:text-red-700 font-medium text-sm"
                >
                  删除商品
                </button>
              </div>
            </div>
          ))}

          {editedItems.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              没有商品，点击下方"添加商品"按钮来添加
            </div>
          )}

          {/* Add New Item Button */}
          <div className="text-center">
            <button
              onClick={addNewItem}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              + 添加商品
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 border rounded-md hover:bg-gray-100"
          >
            取消
          </button>
          <button
            onClick={() => onSave(editedItems, newImages)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
