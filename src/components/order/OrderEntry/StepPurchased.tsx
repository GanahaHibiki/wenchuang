import { useState } from 'react'
import type { Specification } from '@/types'
import ImageUploader from '@/components/common/ImageUploader'
import SpecificationForm from './SpecificationForm'

export interface PurchasedItemData {
  productName: string
  image: File | null
  imagePreview: string | null
  specifications: Specification[]
}

interface StepPurchasedProps {
  items: PurchasedItemData[]
  onChange: (items: PurchasedItemData[]) => void
  onNext: () => void
  onBack: () => void
}

export default function StepPurchased({
  items,
  onChange,
  onNext,
  onBack,
}: StepPurchasedProps) {
  const [currentIndex, setCurrentIndex] = useState(0)

  const currentItem = items[currentIndex] || {
    productName: '',
    image: null,
    imagePreview: null,
    specifications: [],
  }

  const updateCurrentItem = (updates: Partial<PurchasedItemData>) => {
    const newItems = [...items]
    newItems[currentIndex] = { ...currentItem, ...updates }
    onChange(newItems)
  }

  const handleImageSelect = (file: File) => {
    const preview = URL.createObjectURL(file)
    updateCurrentItem({ image: file, imagePreview: preview })
  }

  const isCurrentItemValid = () => {
    return (
      currentItem.productName.trim() &&
      currentItem.image &&
      currentItem.specifications.length > 0
    )
  }

  const addNewItem = () => {
    if (!isCurrentItemValid()) return

    const newItem: PurchasedItemData = {
      productName: '',
      image: null,
      imagePreview: null,
      specifications: [],
    }
    onChange([...items, newItem])
    setCurrentIndex(items.length)
  }

  const removeItem = (index: number) => {
    if (items.length <= 1) return
    const newItems = items.filter((_, i) => i !== index)
    onChange(newItems)
    if (currentIndex >= newItems.length) {
      setCurrentIndex(newItems.length - 1)
    }
  }

  const canProceed = items.every(
    (item) =>
      item.productName.trim() && item.image && item.specifications.length > 0
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">第二步：已购商品录入</h2>
        <span className="text-sm text-gray-500">
          共 {items.length} 件商品
        </span>
      </div>

      {/* Item tabs */}
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
            商品 {index + 1}
            {item.productName && `: ${item.productName.slice(0, 10)}`}
          </button>
        ))}
      </div>

      {/* Current item form */}
      <div className="border rounded-lg p-4 bg-white">
        <div className="flex justify-between items-start mb-4">
          <h3 className="font-medium">商品 {currentIndex + 1}</h3>
          {items.length > 1 && (
            <button
              onClick={() => removeItem(currentIndex)}
              className="text-red-500 text-sm hover:text-red-700"
            >
              删除此商品
            </button>
          )}
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
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              规格选择 <span className="text-red-500">*</span>
            </label>
            <SpecificationForm
              specifications={currentItem.specifications}
              onChange={(specs) => updateCurrentItem({ specifications: specs })}
              showPurchasePrice={true}
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          上一步
        </button>

        <div className="flex gap-2">
          <button
            onClick={addNewItem}
            disabled={!isCurrentItemValid()}
            className={`px-6 py-2 rounded-lg ${
              isCurrentItemValid()
                ? 'bg-green-500 text-white hover:bg-green-600'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            继续添加新商品
          </button>

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
