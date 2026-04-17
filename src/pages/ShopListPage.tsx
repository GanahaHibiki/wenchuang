import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { shopApi } from '@/api/client'
import type { Shop } from '@/types'

export default function ShopListPage() {
  const navigate = useNavigate()
  const [shops, setShops] = useState<Shop[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadShops()
  }, [])

  const loadShops = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const data = await shopApi.getAll()
      setShops(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">加载中...</div>
  }

  if (error) {
    return <div className="text-center py-12 text-red-500">{error}</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">已购店铺</h1>

      {shops.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          暂无店铺记录，请先录入订单
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  #
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  店铺名称
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  创建时间
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {shops.map((shop, index) => (
                <tr
                  key={shop.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/?shop=${encodeURIComponent(shop.name)}`)}
                >
                  <td className="px-4 py-3 text-gray-500">{index + 1}</td>
                  <td className="px-4 py-3 font-bold">{shop.name}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(shop.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-sm text-gray-500">
        共 {shops.length} 家店铺
      </div>
    </div>
  )
}
