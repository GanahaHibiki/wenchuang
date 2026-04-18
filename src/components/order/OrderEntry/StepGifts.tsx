import { useState, useEffect } from 'react'
import type { Specification, GiftType, Product } from '@/types'
import { GIFT_TYPES } from '@/types'
import { productApi, wishApi, type WishProduct } from '@/api/client'
import ImageUploader from '@/components/common/ImageUploader'
import SpecificationForm from './SpecificationForm'

export interface GiftItemData {
  giftType: GiftType
  customGiftType?: string
  productName: string
  image: File | null
  imagePreview: string | null
  specifications: Specification[]
  isFromWish?: boolean
}

interface StepGiftsProps {
  items: GiftItemData[]
  onChange: (items: GiftItemData[]) => void
  onNext: () => void
  onBack: () => void
  shopName: string
  previousItems: { productName: string; imagePreview: string | null }[]
}

export default function StepGifts({
  items,
  onChange,
  onNext,
  onBack,
  shopName,
  previousItems,
}: StepGiftsProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [shopProducts, setShopProducts] = useState<Product[]>([])
  const [wishProducts, setWishProducts] = useState<WishProduct[]>([])
  const [isLoadingShopProducts, setIsLoadingShopProducts] = useState(false)
  const [lastCheckedName, setLastCheckedName] = useState('')

  const emptyItem: GiftItemData = {
    giftType: '满赠礼',
    customGiftType: '',
    productName: '',
    image: null,
    imagePreview: null,
    specifications: [],
  }

  const currentItem = items[currentIndex] || emptyItem

  const handleTabSwitch = (index: number) => {
    setCurrentIndex(index)
    setLastCheckedName('')
  }

  const handleProductNameBlur = () => {
    const trimmedName = currentItem.productName.trim()
    if (!trimmedName || trimmedName === lastCheckedName) return

    setLastCheckedName(trimmedName)

    const lowerName = trimmedName.toLowerCase()

    // Check for duplicates in:
    // 1. Shop products from other orders (same shop)
    // 2. Wish products (same shop)
    // 3. Previous steps (purchased items)
    // 4. Current step other items (excluding current item)
    const shopProductNames = shopProducts.map(p => p.name.trim().toLowerCase())
    const wishProductNames = wishProducts.map(p => p.productName.trim().toLowerCase())
    const previousStepNames = previousItems.map(item => item.productName.trim().toLowerCase())
    const currentStepNames = items
      .filter((_, idx) => idx !== currentIndex)
      .map(item => item.productName.trim().toLowerCase())

    // Check wish products first
    const matchingWish = wishProducts.find(
      w => w.productName.trim().toLowerCase() === lowerName
    )

    if (matchingWish) {
      const userConfirmed = window.confirm(
        `商品名"${trimmedName}"与该店铺的心愿商品重名。\n\n` +
        `是否为心愿商品？\n\n` +
        `- 点击"确定"：这是心愿商品，将自动填充图片\n` +
        `- 点击"取消"：这是不同商品，将自动添加序号区分`
      )

      if (userConfirmed) {
        updateCurrentItem({
          imagePreview: `/images/original/${matchingWish.imagePath}`,
          isFromWish: true
        })
      } else {
        const allNames = [...shopProductNames, ...wishProductNames, ...previousStepNames, ...currentStepNames]
        const duplicateCount = allNames.filter(name => name === lowerName).length
        const newName = `${trimmedName} (${duplicateCount + 1})`
        updateCurrentItem({ productName: newName })
        setLastCheckedName(newName)
      }
      return
    }

    const allExistingNames = [...shopProductNames, ...previousStepNames, ...currentStepNames]
    const duplicateCount = allExistingNames.filter(name => name === lowerName).length

    if (duplicateCount > 0) {
      const userConfirmed = window.confirm(
        `商品名"${trimmedName}"与之前录入的同店铺商品重名。\n\n` +
        `是否为相同商品？\n\n` +
        `- 点击"确定"：这是相同商品，将自动填充图片\n` +
        `- 点击"取消"：这是不同商品，将自动添加序号区分`
      )

      if (userConfirmed) {
        const matchingShopProduct = shopProducts.find(
          p => p.name.trim().toLowerCase() === lowerName
        )
        if (matchingShopProduct) {
          updateCurrentItem({
            imagePreview: `/images/original/${matchingShopProduct.imagePath}`
          })
        } else {
          const matchingPreviousItem = previousItems.find(
            item => item.productName.trim().toLowerCase() === lowerName
          )
          if (matchingPreviousItem && matchingPreviousItem.imagePreview) {
            updateCurrentItem({
              imagePreview: matchingPreviousItem.imagePreview
            })
          } else {
            const matchingCurrentItem = items.find(
              (item, idx) => idx !== currentIndex &&
              item.productName.trim().toLowerCase() === lowerName
            )
            if (matchingCurrentItem && matchingCurrentItem.imagePreview) {
              updateCurrentItem({
                imagePreview: matchingCurrentItem.imagePreview
              })
            }
          }
        }
      } else {
        const newName = `${trimmedName} (${duplicateCount + 1})`
        updateCurrentItem({ productName: newName })
        setLastCheckedName(newName)
      }
    }
  }

  // Load shop products and wish products
  useEffect(() => {
    const loadProducts = async () => {
      if (!shopName) return

      setIsLoadingShopProducts(true)
      try {
        const [products, wishes] = await Promise.all([
          productApi.search('shopName', shopName),
          wishApi.getByShop(shopName)
        ])
        setShopProducts(products)
        setWishProducts(wishes)
      } catch (error) {
        console.error('Failed to load products:', error)
      } finally {
        setIsLoadingShopProducts(false)
      }
    }

    loadProducts()
  }, [shopName])

  const handleSelectProduct = async (selection: string) => {
    if (selection === 'manual') {
      updateCurrentItem({ productName: '', image: null, imagePreview: null, isFromWish: false })
      return
    }

    // Check if it's a wish product
    if (selection.startsWith('wish_')) {
      const wishId = selection.replace('wish_', '')
      const wish = wishProducts.find(w => w.id === wishId)
      if (wish) {
        updateCurrentItem({
          productName: wish.productName,
          imagePreview: `/images/original/${wish.imagePath}`,
          isFromWish: true
        })
      }
      return
    }

    // Check if it's from previous items
    const previousItem = previousItems.find((item, idx) => `previous-${idx}` === selection)
    if (previousItem) {
      updateCurrentItem({
        productName: previousItem.productName,
        imagePreview: previousItem.imagePreview,
        isFromWish: false
      })
      return
    }

    // Check if it's from shop products
    const product = shopProducts.find(p => p.id === selection)
    if (product) {
      updateCurrentItem({
        productName: product.name,
        imagePreview: `/images/original/${product.imagePath}`,
        isFromWish: false
      })
    }
  }

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
      (currentItem.image || currentItem.imagePreview) &&
      currentItem.specifications.length > 0
    )
  }

  const addNewItem = () => {
    if (items.length > 0 && !isCurrentItemValid()) return

    const newItem: GiftItemData = {
      giftType: '满赠礼',
      customGiftType: '',
      productName: '',
      image: null,
      imagePreview: null,
      specifications: [],
    }
    onChange([...items, newItem])
    setCurrentIndex(items.length)
    setLastCheckedName('')
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
        item.productName.trim() && (item.image || item.imagePreview) && item.specifications.length > 0
    )

  // Don't filter for gifts - allow duplicates since same product can have different gift types
  const availablePreviousItems = previousItems
  const availableShopProducts = shopProducts
  const availableWishProducts = wishProducts

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
              onClick={() => handleTabSwitch(index)}
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
              <div className="flex gap-4 flex-wrap">
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
              {currentItem.giftType === '其他' && (
                <div className="mt-2">
                  <input
                    type="text"
                    value={currentItem.customGiftType || ''}
                    onChange={(e) => updateCurrentItem({ customGiftType: e.target.value })}
                    placeholder="请输入礼品类型名称"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                选择商品
              </label>
              <select
                onChange={(e) => handleSelectProduct(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                defaultValue="manual"
              >
                <option value="manual">手动输入商品名和图片</option>
                {availableWishProducts.length > 0 && (
                  <optgroup label="心愿商品">
                    {availableWishProducts.map((wish) => (
                      <option key={`wish_${wish.id}`} value={`wish_${wish.id}`}>
                        {wish.productName}
                      </option>
                    ))}
                  </optgroup>
                )}
                {availablePreviousItems.length > 0 && (
                  <optgroup label="本订单已录入商品">
                    {availablePreviousItems.map((item, idx) => {
                      const originalIdx = previousItems.indexOf(item)
                      return (
                        <option key={`previous-${originalIdx}`} value={`previous-${originalIdx}`}>
                          {item.productName}
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                商品名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={currentItem.productName}
                onChange={(e) => updateCurrentItem({ productName: e.target.value })}
                onBlur={handleProductNameBlur}
                placeholder="请输入商品名称或从上方选择"
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
