import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { orderApi } from '@/api/client'
import type { OrderSummary } from '@/types'

type SortField = 'totalAmount' | 'giftTotal' | 'giftRatio'
type SortOrder = 'asc' | 'desc'

export default function OrderListPage() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  useEffect(() => {
    loadOrders()
  }, [sortField, sortOrder])

  const loadOrders = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const data = await orderApi.getAll(sortField || undefined, sortField ? sortOrder : undefined)
      setOrders(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return '↕️'
    return sortOrder === 'asc' ? '⬆️' : '⬇️'
  }

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">加载中...</div>
  }

  if (error) {
    return <div className="text-center py-12 text-red-500">{error}</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">订单详情</h1>

      {orders.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          暂无订单，请先<Link to="/order-entry" className="text-blue-500 hover:underline">录入订单</Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  序号
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  店铺名称
                </th>
                <th
                  className="px-4 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('totalAmount')}
                >
                  订单金额 {getSortIcon('totalAmount')}
                </th>
                <th
                  className="px-4 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('giftTotal')}
                >
                  礼品总价 {getSortIcon('giftTotal')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  小礼物总价
                </th>
                <th
                  className="px-4 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('giftRatio')}
                >
                  小礼物占比 {getSortIcon('giftRatio')}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/orders/${order.id}`)}
                >
                  <td className="px-4 py-3">
                    {order.sequenceNumber}
                  </td>
                  <td className="px-4 py-3">{order.shopName}</td>
                  <td className="px-4 py-3">¥{order.totalAmount.toFixed(2)}</td>
                  <td className="px-4 py-3">¥{(order.giftTotal || 0).toFixed(2)}</td>
                  <td className="px-4 py-3">¥{order.smallGiftTotal.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    {order.totalAmount > 0 ? `${order.giftRatio.toFixed(1)}%` : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-blue-500 text-sm">
                      查看详情
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
