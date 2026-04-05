import { useState } from 'react'
import type { Specification, GiftType } from '@/types'
import { GIFT_TYPES } from '@/types'
import ImageUploader from '@/components/common/ImageUploader'
import SpecificationForm from './SpecificationForm'

export interface GiftItemData {
  giftType: GiftType
  productName: string
  image: File | null
  imagePreview: string | null
  specifications: Specification[]
}

interface StepGiftsProps {
  items: GiftItemData[]
  onChange: (items: GiftItemData[]) => void
  onNext: () => void
  onBack: () => void
}

export default function StepGifts({
  items,
  onChange,
  onNext,
  onBack,
}: StepGiftsProps) {
  const [currentIndex, setCurrentIndex] = useState(0)

  const emptyItem: GiftItemData = {
    giftType: '满赠礼',
    productName: '',
    image: null,
    imagePreview: null,
    specifications: [],
  }

  const currentItem = items[currentIndex] || emptyItem

  const updateCurrentItem = (updates: Partial<GiftItemData>) => {
    const newItems = [...items]
    if (newItems.length === 0) {
      newItems.push({ ...emptyItem, ...updates })
    } else {
      newItems[currentIndex] = { ...currentItem, ...updates }
    }
    onChange(newItems)
  }

  const handleImageSelect = (file: File) => {
    const preview = URL.createObjectURL(file)
    updateCurrentItem({ image: file, imagePreview: preview })
  }

  const isCurrentItemValid = () => {
    if (items.length === 0) return true // Allow skipping
    return (
      currentItem.productName.trim() &&
      currentItem.image &&
      currentItem.specifications.length > 0
    )
  }

  const addNewItem = () => {
    if (items.length > 0 && !isCurrentItemValid()) return

    const newItem: GiftItemData = {
      giftType: '满赠礼',
      productName: '',
      image: null,
      imagePreview: null,
      specifications: [],
    }
    onChange([...items, newItem])
    setCurrentIndex(items.length)
  }

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index)
    onChange(newItems)
    if (currentIndex >= newItems.length) {
      setCurrentIndex(Math.max(0, newItems.length - 1))
    }
  }

  const canProceed =
    items.length === 0 ||
    items.every(
      (item) =>
        item.productName.trim() && item.image && item.specifications.length > 0
    )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">第三步：礼品录入</h2>
        <span className="text-sm text-gray-500">
          共 {items.length} 件礼品 (可跳过)
        </span>
      </div>

      {/* Item tabs */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map((item, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`px-3 py-1 rounded text-sm ${
                index === currentIndex
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}
            >
              礼品 {index + 1}
              {item.productName && `: ${item.productName.slice(0, 10)}`}
            </button>
          ))}
        </div>
      )}

      {/* Add first item button or form */}
      {items.length === 0 ? (
        <div className="border-2 border-dashed rounded-lg p-8 text-center">
          <p className="text-gray-500 mb-4">暂无礼品，点击添加或跳过此步骤</p>
          <button
            onClick={addNewItem}
            className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
          >
            添加礼品
          </button>
        </div>
      ) : (
        <div className="border rounded-lg p-4 bg-white">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-medium">礼品 {currentIndex + 1}</h3>
            <button
              onClick={() => removeItem(currentIndex)}
              className="text-red-500 text-sm hover:text-red-700"
            >
              删除此礼品
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                礼品类型 <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-4">
                {GIFT_TYPES.map((type) => (
                  <label key={type} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="giftType"
                      checked={currentItem.giftType === type}
                      onChange={() => updateCurrentItem({ giftType: type })}
                      className="w-4 h-4"
                    />
                    <span>{type}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                商品名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={currentItem.productName}
                onChange={(e) => updateCurrentItem({ productName: e.target.value })}
                placeholder="请输入商品名称"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                商品图片 <span className="text-red-500">*</span>
              </label>
              <ImageUploader
                onImageSelect={handleImageSelect}
                preview={currentItem.imagePreview}
                alwaysListenClipboard={true}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                规格选择 <span className="text-red-500">*</span>
              </label>
              <SpecificationForm
                specifications={currentItem.specifications}
                onChange={(specs) => updateCurrentItem({ specifications: specs })}
                showPurchasePrice={false}
              />
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          上一步
        </button>

        <div className="flex gap-2">
          {items.length > 0 && (
            <button
              onClick={addNewItem}
              disabled={!isCurrentItemValid()}
              className={`px-6 py-2 rounded-lg ${
                isCurrentItemValid()
                  ? 'bg-green-500 text-white hover:bg-green-600'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              继续添加新礼品
            </button>
          )}

          <button
            onClick={onNext}
            disabled={!canProceed}
            className={`px-6 py-2 rounded-lg ${
              canProceed
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            进入下一步
          </button>
        </div>
      </div>
    </div>
  )
}
