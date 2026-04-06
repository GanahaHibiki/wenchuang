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
  const [lastCheckedName, setLastCheckedName] = useState('')

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
      setLastCheckedName('')
    } else if (selection) {
      const shop = shops.find(s => s.id === selection)
      if (shop) {
        onChange(shop.name)
        setShowInput(false)
        setLastCheckedName('')
      }
    }
  }

  const handleShopNameBlur = () => {
    const trimmedName = shopName.trim()
    if (!trimmedName || trimmedName === lastCheckedName) return

    setLastCheckedName(trimmedName)

    // Check for duplicates in existing shops (case-insensitive)
    const existingShopNames = shops.map(s => s.name.trim().toLowerCase())
    const duplicateCount = existingShopNames.filter(name => name === trimmedName.toLowerCase()).length

    if (duplicateCount > 0) {
      const userConfirmed = window.confirm(
        `店铺名"${trimmedName}"与之前录入的店铺重名。\n\n` +
        `是否为相同店铺？\n\n` +
        `- 点击"确定"：这是相同店铺\n` +
        `- 点击"取消"：这是不同店铺，将自动添加序号区分`
      )

      if (!userConfirmed) {
        // User says it's different shop, add sequence number
        const newName = `${trimmedName} (${duplicateCount + 1})`
        onChange(newName)
        setLastCheckedName(newName)
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
              onBlur={handleShopNameBlur}
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
