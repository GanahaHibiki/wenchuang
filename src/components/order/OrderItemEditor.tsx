import { useState } from 'react'
import type { OrderItem, Product, Specification, GiftType } from '@/types'
import { SPECIFICATION_TYPES, GIFT_TYPES } from '@/types'

interface OrderItemEditorProps {
  items: (OrderItem & { product: Product })[]
  category: 'purchased' | 'gift' | 'smallGift'
  onSave: (items: (OrderItem & { product: Product })[]) => void
  onCancel: () => void
}

export default function OrderItemEditor({ items, category, onSave, onCancel }: OrderItemEditorProps) {
  const [editedItems, setEditedItems] = useState(items)

  const updateItemName = (index: number, name: string) => {
    const newItems = [...editedItems]
    newItems[index] = {
      ...newItems[index],
      product: { ...newItems[index].product, name }
    }
    setEditedItems(newItems)
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
    specs.push({
      type: '试吃set',
      sequenceNumber: 1,
      quantity: 0,
      purchasePrice: category === 'purchased' ? 0 : undefined,
      originalPrice: 0
    })
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
    setEditedItems(editedItems.filter((_, i) => i !== index))
  }

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
              <div className="flex justify-between items-start">
                <div className="flex-1 space-y-3">
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
                      {item.specifications.map((spec, specIndex) => (
                        <div key={specIndex} className="flex gap-2 items-start bg-gray-50 p-2 rounded">
                          <div className="flex-1 grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-gray-600">类型</label>
                              <select
                                value={spec.type}
                                onChange={(e) => updateSpecification(itemIndex, specIndex, 'type', e.target.value)}
                                className="w-full px-2 py-1 border rounded text-sm"
                              >
                                {SPECIFICATION_TYPES.map((type) => (
                                  <option key={type} value={type}>{type}</option>
                                ))}
                              </select>
                            </div>
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
                      ))}
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
              没有商品
            </div>
          )}
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
            onClick={() => onSave(editedItems)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
