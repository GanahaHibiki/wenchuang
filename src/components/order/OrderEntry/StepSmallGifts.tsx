import { useState } from 'react'
import type { Specification } from '@/types'
import ImageUploader from '@/components/common/ImageUploader'
import SpecificationForm from './SpecificationForm'

export interface SmallGiftItemData {
  productName: string
  image: File | null
  imagePreview: string | null
  specifications: Specification[]
}

interface StepSmallGiftsProps {
  items: SmallGiftItemData[]
  onChange: (items: SmallGiftItemData[]) => void
  onSubmit: () => void
  onBack: () => void
  isSubmitting: boolean
}

export default function StepSmallGifts({
  items,
  onChange,
  onSubmit,
  onBack,
  isSubmitting,
}: StepSmallGiftsProps) {
  const [currentIndex, setCurrentIndex] = useState(0)

  const emptyItem: SmallGiftItemData = {
    productName: '',
    image: null,
    imagePreview: null,
    specifications: [],
  }

  const currentItem = items[currentIndex] || emptyItem

  const updateCurrentItem = (updates: Partial<SmallGiftItemData>) => {
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
    if (items.length === 0) return true
    return (
      currentItem.productName.trim() &&
      currentItem.image &&
      currentItem.specifications.length > 0
    )
  }

  const addNewItem = () => {
    if (items.length > 0 && !isCurrentItemValid()) return

    const newItem: SmallGiftItemData = {
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

  const canSubmit =
    items.length === 0 ||
    items.every(
      (item) =>
        item.productName.trim() && item.image && item.specifications.length > 0
    )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">第四步：小礼物录入</h2>
        <span className="text-sm text-gray-500">
          共 {items.length} 件小礼物 (可跳过)
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
              小礼物 {index + 1}
              {item.productName && `: ${item.productName.slice(0, 10)}`}
            </button>
          ))}
        </div>
      )}

      {/* Add first item or form */}
      {items.length === 0 ? (
        <div className="border-2 border-dashed rounded-lg p-8 text-center">
          <p className="text-gray-500 mb-4">暂无小礼物，点击添加或完成录入</p>
          <button
            onClick={addNewItem}
            className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
          >
            添加小礼物
          </button>
        </div>
      ) : (
        <div className="border rounded-lg p-4 bg-white">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-medium">小礼物 {currentIndex + 1}</h3>
            <button
              onClick={() => removeItem(currentIndex)}
              className="text-red-500 text-sm hover:text-red-700"
            >
              删除此小礼物
            </button>
          </div>

          <div className="space-y-4">
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
          disabled={isSubmitting}
          className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          上一步
        </button>

        <div className="flex gap-2">
          {items.length > 0 && (
            <button
              onClick={addNewItem}
              disabled={!isCurrentItemValid() || isSubmitting}
              className={`px-6 py-2 rounded-lg ${
                isCurrentItemValid() && !isSubmitting
                  ? 'bg-green-500 text-white hover:bg-green-600'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              继续添加新小礼物
            </button>
          )}

          <button
            onClick={onSubmit}
            disabled={!canSubmit || isSubmitting}
            className={`px-6 py-2 rounded-lg ${
              canSubmit && !isSubmitting
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? '提交中...' : '录入完成'}
          </button>
        </div>
      </div>
    </div>
  )
}
