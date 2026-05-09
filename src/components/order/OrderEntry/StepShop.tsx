import { useState, useEffect } from 'react'
import { shopApi } from '@/api/client'
import type { Shop } from '@/types'
import ShopInput from '@/components/common/ShopInput'

interface StepShopProps {
  shopName: string
  onChange: (name: string) => void
  onNext: () => void
}

export default function StepShop({ shopName, onChange, onNext }: StepShopProps) {
  const [shops, setShops] = useState<Shop[]>([])
  const [lastCheckedName, setLastCheckedName] = useState('')

  useEffect(() => {
    loadShops()
  }, [])

  const loadShops = async () => {
    try {
      const data = await shopApi.getAll()
      setShops(data)
    } catch (error) {
      console.error('Failed to load shops:', error)
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
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            店铺名称 <span className="text-red-500">*</span>
          </label>
          <ShopInput
            value={shopName}
            onChange={onChange}
            onBlur={handleShopNameBlur}
            placeholder="输入或选择店铺名"
            required
          />
        </div>

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
