import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StepShop from './StepShop'
import StepPurchased, { PurchasedItemData } from './StepPurchased'
import StepGifts, { GiftItemData } from './StepGifts'
import StepSmallGifts, { SmallGiftItemData } from './StepSmallGifts'
import { orderApi, wishApi } from '@/api/client'

type Step = 'shop' | 'purchased' | 'gifts' | 'smallGifts'

const STEPS: { key: Step; label: string }[] = [
  { key: 'shop', label: '店铺信息' },
  { key: 'purchased', label: '已购商品' },
  { key: 'gifts', label: '礼品' },
  { key: 'smallGifts', label: '小礼物' },
]

export default function OrderEntry() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState<Step>('shop')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form data
  const [shopName, setShopName] = useState('')
  const [purchasedItems, setPurchasedItems] = useState<PurchasedItemData[]>([
    { productName: '', image: null, imagePreview: null, specifications: [] },
  ])
  const [giftItems, setGiftItems] = useState<GiftItemData[]>([])
  const [smallGiftItems, setSmallGiftItems] = useState<SmallGiftItemData[]>([])

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('shopName', shopName)

      // Add purchased items
      const purchasedData = purchasedItems.map((item) => ({
        productName: item.productName,
        specifications: item.specifications,
        existingImagePath: !item.image && item.imagePreview
          ? item.imagePreview.replace('/images/original/', '')
          : undefined,
      }))
      formData.append('purchasedItems', JSON.stringify(purchasedData))
      purchasedItems.forEach((item, index) => {
        if (item.image) {
          formData.append(`purchasedImage_${index}`, item.image)
        }
      })

      // Add gifts
      const giftsData = giftItems.map((item) => ({
        giftType: item.giftType,
        customGiftType: item.customGiftType,
        productName: item.productName,
        specifications: item.specifications,
        existingImagePath: !item.image && item.imagePreview
          ? item.imagePreview.replace('/images/original/', '')
          : undefined,
      }))
      formData.append('gifts', JSON.stringify(giftsData))
      giftItems.forEach((item, index) => {
        if (item.image) {
          formData.append(`giftImage_${index}`, item.image)
        }
      })

      // Add small gifts
      const smallGiftsData = smallGiftItems.map((item) => ({
        productName: item.productName,
        specifications: item.specifications,
        existingImagePath: !item.image && item.imagePreview
          ? item.imagePreview.replace('/images/original/', '')
          : undefined,
      }))
      formData.append('smallGifts', JSON.stringify(smallGiftsData))
      smallGiftItems.forEach((item, index) => {
        if (item.image) {
          formData.append(`smallGiftImage_${index}`, item.image)
        }
      })

      const order = await orderApi.create(formData)

      // Delete wish items that were added to the order
      const wishItemsToDelete = [
        ...purchasedItems.filter(item => item.isFromWish),
        ...giftItems.filter(item => item.isFromWish),
        ...smallGiftItems.filter(item => item.isFromWish),
      ]

      for (const item of wishItemsToDelete) {
        try {
          await wishApi.deleteByProductName(shopName, item.productName)
        } catch (err) {
          console.error('Failed to delete wish item:', err)
        }
      }

      navigate(`/orders/${order.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请重试')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => (
            <div key={step.key} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  index <= currentStepIndex
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {index + 1}
              </div>
              <span
                className={`ml-2 text-sm ${
                  index <= currentStepIndex ? 'text-blue-500' : 'text-gray-500'
                }`}
              >
                {step.label}
              </span>
              {index < STEPS.length - 1 && (
                <div
                  className={`w-16 h-1 mx-4 ${
                    index < currentStepIndex ? 'bg-blue-500' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
          {error}
        </div>
      )}

      {/* Step content */}
      <div className="bg-white rounded-lg shadow p-6">
        {currentStep === 'shop' && (
          <StepShop
            shopName={shopName}
            onChange={setShopName}
            onNext={() => setCurrentStep('purchased')}
          />
        )}

        {currentStep === 'purchased' && (
          <StepPurchased
            items={purchasedItems}
            onChange={setPurchasedItems}
            onNext={() => setCurrentStep('gifts')}
            onBack={() => setCurrentStep('shop')}
            shopName={shopName}
          />
        )}

        {currentStep === 'gifts' && (
          <StepGifts
            items={giftItems}
            onChange={setGiftItems}
            onNext={() => setCurrentStep('smallGifts')}
            onBack={() => setCurrentStep('purchased')}
            shopName={shopName}
            previousItems={purchasedItems.map(item => ({
              productName: item.productName,
              imagePreview: item.imagePreview
            }))}
          />
        )}

        {currentStep === 'smallGifts' && (
          <StepSmallGifts
            items={smallGiftItems}
            onChange={setSmallGiftItems}
            onSubmit={handleSubmit}
            onBack={() => setCurrentStep('gifts')}
            isSubmitting={isSubmitting}
            shopName={shopName}
            previousItems={[
              ...purchasedItems.map(item => ({
                productName: item.productName,
                imagePreview: item.imagePreview
              })),
              ...giftItems.map(item => ({
                productName: item.productName,
                imagePreview: item.imagePreview
              }))
            ]}
          />
        )}
      </div>
    </div>
  )
}
