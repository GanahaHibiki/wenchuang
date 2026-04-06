import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ShopItemsEntry from './ShopItemsEntry'
import { orderApi } from '@/api/client'
import type { PurchasedItemData } from '../OrderEntry/StepPurchased'

export interface ShopItemsData {
  shopName: string
  items: PurchasedItemData[]
}

export default function GroupOrderEntry() {
  const navigate = useNavigate()
  const [shopItemsList, setShopItemsList] = useState<ShopItemsData[]>([
    { shopName: '', items: [{ productName: '', image: null, imagePreview: null, specifications: [] }] }
  ])
  const [currentShopIndex, setCurrentShopIndex] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentShopItems = shopItemsList[currentShopIndex]

  const updateCurrentShopItems = (updates: Partial<ShopItemsData>) => {
    const newList = [...shopItemsList]
    newList[currentShopIndex] = { ...currentShopItems, ...updates }
    setShopItemsList(newList)
  }

  const addNewShop = () => {
    // Validate current shop before adding new one
    if (!currentShopItems.shopName.trim()) {
      alert('请先填写当前店铺名称')
      return
    }

    const hasValidItems = currentShopItems.items.every(
      item => item.productName.trim() && (item.image || item.imagePreview) && item.specifications.length > 0
    )

    if (!hasValidItems) {
      alert('请完成当前店铺的商品录入')
      return
    }

    setShopItemsList([...shopItemsList, {
      shopName: '',
      items: [{ productName: '', image: null, imagePreview: null, specifications: [] }]
    }])
    setCurrentShopIndex(shopItemsList.length)
  }

  const removeShop = (index: number) => {
    if (shopItemsList.length <= 1) {
      alert('至少需要保留一个店铺')
      return
    }

    const newList = shopItemsList.filter((_, i) => i !== index)
    setShopItemsList(newList)
    if (currentShopIndex >= newList.length) {
      setCurrentShopIndex(newList.length - 1)
    }
  }

  const handleSubmit = async () => {
    // Validate all shops
    for (let i = 0; i < shopItemsList.length; i++) {
      const shop = shopItemsList[i]
      if (!shop.shopName.trim()) {
        alert(`店铺 ${i + 1} 名称不能为空`)
        return
      }

      const hasValidItems = shop.items.every(
        item => item.productName.trim() && (item.image || item.imagePreview) && item.specifications.length > 0
      )

      if (!hasValidItems) {
        alert(`店铺 ${i + 1} 的商品信息不完整`)
        return
      }
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('orderType', 'group')

      // Add shops data
      const shopsData = shopItemsList.map(shop => ({
        shopName: shop.shopName,
        items: shop.items.map(item => ({
          productName: item.productName,
          specifications: item.specifications
        }))
      }))
      formData.append('shops', JSON.stringify(shopsData))

      // Add images
      shopItemsList.forEach((shop, shopIndex) => {
        shop.items.forEach((item, itemIndex) => {
          if (item.image) {
            formData.append(`shop${shopIndex}_item${itemIndex}`, item.image)
          }
        })
      })

      const order = await orderApi.createGroupOrder(formData)
      navigate(`/orders/${order.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit = shopItemsList.every(shop =>
    shop.shopName.trim() && shop.items.every(
      item => item.productName.trim() && (item.image || item.imagePreview) && item.specifications.length > 0
    )
  )

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          💡 提示：拼单订单可以包含多个店铺的商品，每个店铺独立录入商品信息
        </p>
      </div>

      {/* Shop tabs */}
      {shopItemsList.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {shopItemsList.map((shop, index) => (
            <button
              key={index}
              onClick={() => setCurrentShopIndex(index)}
              className={`px-4 py-2 rounded-lg text-sm ${
                index === currentShopIndex
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}
            >
              店铺 {index + 1}
              {shop.shopName && `: ${shop.shopName.slice(0, 10)}`}
            </button>
          ))}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
          {error}
        </div>
      )}

      {/* Current shop entry */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">店铺 {currentShopIndex + 1}</h2>
          {shopItemsList.length > 1 && (
            <button
              onClick={() => removeShop(currentShopIndex)}
              className="text-red-500 text-sm hover:text-red-700"
            >
              删除此店铺
            </button>
          )}
        </div>

        <ShopItemsEntry
          shopName={currentShopItems.shopName}
          items={currentShopItems.items}
          onShopNameChange={(name) => updateCurrentShopItems({ shopName: name })}
          onItemsChange={(items) => updateCurrentShopItems({ items })}
          allShopNames={shopItemsList.map(s => s.shopName).filter(Boolean)}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        <button
          onClick={addNewShop}
          className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
        >
          添加新店铺
        </button>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isSubmitting}
          className={`px-6 py-2 rounded-lg ${
            canSubmit && !isSubmitting
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isSubmitting ? '提交中...' : '提交拼单订单'}
        </button>
      </div>
    </div>
  )
}
