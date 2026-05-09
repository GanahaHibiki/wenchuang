import { useState, useEffect } from 'react'
import { shopApi } from '@/api/client'
import type { Shop } from '@/types'

interface ShopInputProps {
  value: string
  onChange: (name: string) => void
  onBlur?: () => void
  excludeShops?: string[]
  placeholder?: string
  required?: boolean
  className?: string
}

export default function ShopInput({
  value,
  onChange,
  onBlur,
  excludeShops = [],
  placeholder = '输入或选择店铺名',
  required = false,
  className = ''
}: ShopInputProps) {
  const [shops, setShops] = useState<Shop[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    loadShops()
  }, [])

  const loadShops = async () => {
    setIsLoading(true)
    try {
      const data = await shopApi.getAll()
      setShops(data)
    } catch (error) {
      console.error('Failed to load shops:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Filter shops based on input and exclude list
  const filteredShops = shops.filter(shop =>
    shop.name.toLowerCase().includes(value.toLowerCase()) &&
    !excludeShops.includes(shop.name)
  )

  const handleSelect = (shopName: string) => {
    onChange(shopName)
    setShowDropdown(false)
  }

  const handleBlur = () => {
    // Delay to allow click on dropdown item
    setTimeout(() => {
      setShowDropdown(false)
      onBlur?.()
    }, 200)
  }

  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setShowDropdown(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        required={required}
      />
      {showDropdown && filteredShops.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
          {filteredShops.map(shop => (
            <div
              key={shop.id}
              className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
              onClick={() => handleSelect(shop.name)}
            >
              {shop.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
