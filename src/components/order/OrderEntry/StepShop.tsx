import { useState, useEffect } from 'react'
import { shopApi } from '@/api/client'
import type { Shop } from '@/types'

interface StepShopProps {
  shopName: string
  onChange: (name: string) => void
  onNext: () => void
}

export default function StepShop({ shopName, onChange, onNext }: StepShopProps) {
  const [shops, setShops] = useState<Shop[]>([])
  const [isLoadingShops, setIsLoadingShops] = useState(false)
  const [showInput, setShowInput] = useState(false)

  useEffect(() => {
    loadShops()
  }, [])

  const loadShops = async () => {
    setIsLoadingShops(true)
    try {
      const data = await shopApi.getAll()
      setShops(data)
    } catch (error) {
      console.error('Failed to load shops:', error)
    } finally {
      setIsLoadingShops(false)
    }
  }

  const handleSelectShop = (selection: string) => {
    if (selection === 'new') {
      setShowInput(true)
      onChange('')
    } else if (selection) {
      const shop = shops.find(s => s.id === selection)
      if (shop) {
        onChange(shop.name)
        setShowInput(false)
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (shopName.trim()) {
      onNext()
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-6">第一步：店铺信息</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {!showInput && shops.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              选择店铺
            </label>
            <select
              onChange={(e) => handleSelectShop(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={shopName && shops.find(s => s.name === shopName) ? shops.find(s => s.name === shopName)!.id : ''}
            >
              <option value="">请选择店铺或输入新店铺</option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
              <option value="new">+ 输入新店铺名</option>
            </select>
          </div>
        )}

        {(showInput || shops.length === 0 || shopName) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              店铺名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={shopName}
              onChange={(e) => onChange(e.target.value)}
              placeholder="请输入店铺名称"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            {showInput && (
              <button
                type="button"
                onClick={() => {
                  setShowInput(false)
                  onChange('')
                }}
                className="text-sm text-blue-600 hover:text-blue-700 mt-2"
              >
                ← 返回选择已有店铺
              </button>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={!shopName.trim()}
          className={`w-full py-2 rounded-lg text-white ${
            shopName.trim()
              ? 'bg-blue-500 hover:bg-blue-600'
              : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          确认并进入下一步
        </button>
      </form>
    </div>
  )
}
