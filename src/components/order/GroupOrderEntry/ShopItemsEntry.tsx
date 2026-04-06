import { useState, useEffect } from 'react'
import { shopApi, productApi } from '@/api/client'
import type { Shop, Product } from '@/types'
import type { PurchasedItemData } from '../OrderEntry/StepPurchased'
import ImageUploader from '@/components/common/ImageUploader'
import SpecificationForm from '../OrderEntry/SpecificationForm'

interface ShopItemsEntryProps {
  shopName: string
  items: PurchasedItemData[]
  onShopNameChange: (name: string) => void
  onItemsChange: (items: PurchasedItemData[]) => void
  allShopNames: string[]
}

export default function ShopItemsEntry({
  shopName,
  items,
  onShopNameChange,
  onItemsChange,
  allShopNames
}: ShopItemsEntryProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [shops, setShops] = useState<Shop[]>([])
  const [shopProducts, setShopProducts] = useState<Product[]>([])
  const [showShopInput, setShowShopInput] = useState(false)

  const currentItem = items[currentIndex] || {
    productName: '',
    image: null,
    imagePreview: null,
    specifications: [],
  }

  // Load shops
  useEffect(() => {
    loadShops()
  }, [])

  // Load shop products when shop name changes
  useEffect(() => {
    if (shopName.trim()) {
      loadShopProducts()
    }
  }, [shopName])

  const loadShops = async () => {
    try {
      const data = await shopApi.getAll()
      setShops(data)
    } catch (error) {
      console.error('Failed to load shops:', error)
    }
  }

  const loadShopProducts = async () => {
    if (!shopName) return

    try {
      const products = await productApi.search('shopName', shopName)
      setShopProducts(products)
    } catch (error) {
      console.error('Failed to load shop products:', error)
    }
  }

  const handleSelectShop = (selection: string) => {
    if (selection === 'new') {
      setShowShopInput(true)
      onShopNameChange('')
    } else if (selection) {
      const shop = shops.find(s => s.id === selection)
      if (shop) {
        onShopNameChange(shop.name)
        setShowShopInput(false)
      }
    }
  }

  const handleSelectProduct = (selection: string) => {
    if (selection === 'manual') {
      updateCurrentItem({ productName: '', image: null, imagePreview: null })
      return
    }

    const product = shopProducts.find(p => p.id === selection)
    if (product) {
      updateCurrentItem({
        productName: product.name,
        imagePreview: `/images/original/${product.imagePath}`
      })
    }
  }

  const updateCurrentItem = (updates: Partial<PurchasedItemData>) => {
    const newItems = [...items]
    newItems[currentIndex] = { ...currentItem, ...updates }
    onItemsChange(newItems)
  }

  const handleImageSelect = (file: File) => {
    const preview = URL.createObjectURL(file)
    updateCurrentItem({ image: file, imagePreview: preview })
  }

  const addNewItem = () => {
    const isValid = currentItem.productName.trim() &&
      (currentItem.image || currentItem.imagePreview) &&
      currentItem.specifications.length > 0

    if (!isValid) return

    const newItem: PurchasedItemData = {
      productName: '',
      image: null,
      imagePreview: null,
      specifications: [],
    }
    onItemsChange([...items, newItem])
    setCurrentIndex(items.length)
  }

  const removeItem = (index: number) => {
    if (items.length <= 1) return
    const newItems = items.filter((_, i) => i !== index)
    onItemsChange(newItems)
    if (currentIndex >= newItems.length) {
      setCurrentIndex(newItems.length - 1)
    }
  }

  // Filter out shops already used in this group order
  const availableShops = shops.filter(shop =>
    !allShopNames.includes(shop.name) || shop.name === shopName
  )

  return (
    <div className="space-y-4">
      {/* Shop name selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          店铺名称 <span className="text-red-500">*</span>
        </label>
        {!showShopInput && availableShops.length > 0 && !shopName ? (
          <select
            onChange={(e) => handleSelectShop(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value=""
          >
            <option value="">请选择店铺或输入新店铺</option>
            {availableShops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
              </option>
            ))}
            <option value="new">+ 输入新店铺名</option>
          </select>
        ) : (
          <>
            <input
              type="text"
              value={shopName}
              onChange={(e) => onShopNameChange(e.target.value)}
              placeholder="请输入店铺名称"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            {showShopInput && (
              <button
                type="button"
                onClick={() => {
                  setShowShopInput(false)
                  onShopNameChange('')
                }}
                className="text-sm text-blue-600 hover:text-blue-700 mt-2"
              >
                ← 返回选择已有店铺
              </button>
            )}
          </>
        )}
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
      <div className="border rounded-lg p-4">
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
          {/* Product selection */}
          {shopName && shopProducts.length > 0 && (
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
                <optgroup label="同店铺商品">
                  {shopProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          )}

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
              showPurchasePrice={true}
            />
          </div>
        </div>
      </div>

      {/* Add new item button */}
      <button
        onClick={addNewItem}
        disabled={!currentItem.productName.trim() || (!currentItem.image && !currentItem.imagePreview) || currentItem.specifications.length === 0}
        className={`w-full py-2 rounded-lg ${
          currentItem.productName.trim() && (currentItem.image || currentItem.imagePreview) && currentItem.specifications.length > 0
            ? 'bg-green-500 text-white hover:bg-green-600'
            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        添加新商品
      </button>
    </div>
  )
}
