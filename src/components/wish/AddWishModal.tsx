import { useState, useRef, useEffect } from 'react'
import type { Shop } from '@/types'
import { wishApi, productApi } from '@/api/client'

interface WishItemInput {
  id: string
  productName: string
  imageFile: File | null
  imagePreview: string | null
}

interface AddWishModalProps {
  shops: Shop[]
  onClose: () => void
  onSuccess: () => void
}

export default function AddWishModal({ shops, onClose, onSuccess }: AddWishModalProps) {
  const [shopName, setShopName] = useState('')
  const [showShopDropdown, setShowShopDropdown] = useState(false)
  const [items, setItems] = useState<WishItemInput[]>([
    { id: '1', productName: '', imageFile: null, imagePreview: null }
  ])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<{
    itemId: string
    productName: string
    source: 'wish' | 'purchased'
  } | null>(null)
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  // Filter shops based on input
  const filteredShops = shops.filter(shop =>
    shop.name.toLowerCase().includes(shopName.toLowerCase())
  )

  // Handle paste for clipboard image
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!focusedItemId) return

      const items_list = e.clipboardData?.items
      if (!items_list) return

      for (const item of items_list) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) {
            const preview = URL.createObjectURL(file)
            setItems(prev => prev.map(i =>
              i.id === focusedItemId
                ? { ...i, imageFile: file, imagePreview: preview }
                : i
            ))
          }
          break
        }
      }
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [focusedItemId])

  const handleImageSelect = (itemId: string, file: File) => {
    const preview = URL.createObjectURL(file)
    setItems(prev => prev.map(i =>
      i.id === itemId
        ? { ...i, imageFile: file, imagePreview: preview }
        : i
    ))
  }

  const handleProductNameBlur = async (itemId: string, name: string) => {
    if (!name.trim() || !shopName.trim()) return

    // Check if this product name exists for this shop in wishes or purchased products
    try {
      const [existingWishes, existingProducts] = await Promise.all([
        wishApi.search('shopName', shopName),
        productApi.search('shopName', shopName)
      ])

      const wishDuplicate = existingWishes.find(
        p => p.productName.toLowerCase() === name.toLowerCase() &&
            p.shopName.toLowerCase() === shopName.toLowerCase()
      )

      if (wishDuplicate) {
        setDuplicateWarning({ itemId, productName: name, source: 'wish' })
        return
      }

      const purchasedDuplicate = existingProducts.find(
        p => p.name.toLowerCase() === name.toLowerCase()
      )

      if (purchasedDuplicate) {
        setDuplicateWarning({ itemId, productName: name, source: 'purchased' })
      }
    } catch (err) {
      console.error('Error checking duplicate:', err)
    }
  }

  const handleDuplicateConfirm = (isSame: boolean) => {
    if (!duplicateWarning) return

    if (!isSame) {
      // Add suffix to make it unique
      setItems(prev => prev.map(i =>
        i.id === duplicateWarning.itemId
          ? { ...i, productName: `${duplicateWarning.productName} (2)` }
          : i
      ))
    }
    setDuplicateWarning(null)
  }

  const addItem = () => {
    setItems(prev => [
      ...prev,
      { id: String(Date.now()), productName: '', imageFile: null, imagePreview: null }
    ])
  }

  const removeItem = (id: string) => {
    if (items.length <= 1) return
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const handleSubmit = async () => {
    if (!shopName.trim()) {
      alert('请输入店铺名')
      return
    }

    const validItems = items.filter(i => i.productName.trim() && i.imageFile)
    if (validItems.length === 0) {
      alert('请至少添加一个完整的心愿商品（包含商品名和图片）')
      return
    }

    setIsSubmitting(true)

    try {
      // Find existing shop or use new name
      const existingShop = shops.find(s => s.name === shopName.trim())

      for (const item of validItems) {
        const formData = new FormData()
        formData.append('shopName', shopName.trim())
        formData.append('productName', item.productName.trim())
        formData.append('image', item.imageFile!)
        if (existingShop) {
          formData.append('shopId', existingShop.id)
        }

        await wishApi.create(formData)
      }

      onSuccess()
    } catch (err) {
      alert(err instanceof Error ? err.message : '添加失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold">添加心愿商品</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* Shop Name */}
          <div className="mb-4 relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              店铺名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              onFocus={() => setShowShopDropdown(true)}
              onBlur={() => setTimeout(() => setShowShopDropdown(false), 200)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="输入或选择店铺名"
            />
            {showShopDropdown && filteredShops.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {filteredShops.map(shop => (
                  <div
                    key={shop.id}
                    className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                    onClick={() => {
                      setShopName(shop.name)
                      setShowShopDropdown(false)
                    }}
                  >
                    {shop.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Items */}
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              心愿商品
            </label>
            {items.map((item, index) => (
              <div key={item.id} className="border rounded-lg p-4 relative">
                {items.length > 1 && (
                  <button
                    onClick={() => removeItem(item.id)}
                    className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                  >
                    ✕
                  </button>
                )}
                <div className="flex gap-4">
                  {/* Image Upload */}
                  <div
                    className="w-32 h-24 border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer hover:border-blue-500 transition-colors overflow-hidden"
                    onClick={() => {
                      setFocusedItemId(item.id)
                      fileInputRefs.current.get(item.id)?.click()
                    }}
                    onFocus={() => setFocusedItemId(item.id)}
                    tabIndex={0}
                  >
                    {item.imagePreview ? (
                      <img
                        src={item.imagePreview}
                        alt="预览"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center text-gray-400 text-xs p-2">
                        点击上传<br />或 Ctrl+V 粘贴
                      </div>
                    )}
                  </div>
                  <input
                    ref={(el) => {
                      if (el) fileInputRefs.current.set(item.id, el)
                    }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleImageSelect(item.id, file)
                    }}
                  />

                  {/* Product Name */}
                  <div className="flex-1">
                    <label className="block text-sm text-gray-600 mb-1">
                      商品名 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={item.productName}
                      onChange={(e) => setItems(prev => prev.map(i =>
                        i.id === item.id ? { ...i, productName: e.target.value } : i
                      ))}
                      onBlur={(e) => handleProductNameBlur(item.id, e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="输入商品名"
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={addItem}
              className="w-full py-2 border-2 border-dashed rounded-lg text-gray-500 hover:border-blue-500 hover:text-blue-500 transition-colors"
            >
              + 添加更多商品
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            disabled={isSubmitting}
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            disabled={isSubmitting}
          >
            {isSubmitting ? '添加中...' : '确认添加'}
          </button>
        </div>
      </div>

      {/* Duplicate Warning Dialog */}
      {duplicateWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-6 max-w-md">
            <h3 className="font-bold mb-4">商品名重复</h3>
            <p className="mb-4">
              商品名"{duplicateWarning.productName}"与该店铺已有的
              {duplicateWarning.source === 'wish' ? '心愿商品' : '已购商品'}
              重名。是否为相同商品？
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => handleDuplicateConfirm(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                不是，添加序号
              </button>
              <button
                onClick={() => handleDuplicateConfirm(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                是的，继续添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
