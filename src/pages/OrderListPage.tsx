import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { orderApi } from '@/api/client'
import type { OrderSummary, DeliveryStatus } from '@/types'

type SortField = 'totalAmount' | 'giftTotal' | 'giftRatio'
type SortOrder = 'asc' | 'desc'

export default function OrderListPage() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteValue, setNoteValue] = useState('')

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

  const handleNoteClick = (order: OrderSummary, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingNoteId(order.id)
    setNoteValue(order.note || '')
  }

  const handleNoteSave = async (orderId: string) => {
    try {
      await fetch(`/api/orders/${orderId}/note`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteValue })
      })

      // Update local state
      setOrders(orders.map(o =>
        o.id === orderId ? { ...o, note: noteValue } : o
      ))
      setEditingNoteId(null)
    } catch (err) {
      alert('保存失败')
    }
  }

  const handleNoteKeyDown = (orderId: string, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleNoteSave(orderId)
    } else if (e.key === 'Escape') {
      setEditingNoteId(null)
      setNoteValue('')
    }
  }

  const handleNoteBlur = (orderId: string) => {
    // Auto-save when losing focus
    handleNoteSave(orderId)
  }

  const handleDeliveryStatusChange = async (orderId: string, status: DeliveryStatus) => {
    try {
      await fetch(`/api/orders/${orderId}/delivery-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryStatus: status })
      })

      // Update local state
      setOrders(orders.map(o =>
        o.id === orderId ? { ...o, deliveryStatus: status } : o
      ))
    } catch (err) {
      alert('更新失败')
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
                  到货情况
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  备注
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
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={order.deliveryStatus || '未到货'}
                      onChange={(e) => handleDeliveryStatusChange(order.id, e.target.value as DeliveryStatus)}
                      className={`px-2 py-1 border rounded text-sm font-medium ${
                        (order.deliveryStatus || '未到货') === '已到货'
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="未到货">未到货</option>
                      <option value="已到货">已到货</option>
                    </select>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {editingNoteId === order.id ? (
                      <input
                        type="text"
                        value={noteValue}
                        onChange={(e) => setNoteValue(e.target.value)}
                        onKeyDown={(e) => handleNoteKeyDown(order.id, e)}
                        onBlur={() => handleNoteBlur(order.id)}
                        className="px-2 py-1 border rounded text-sm w-full"
                        placeholder="输入备注后按回车"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div
                        onClick={(e) => handleNoteClick(order, e)}
                        className="text-blue-500 text-sm hover:underline cursor-pointer"
                      >
                        {order.note || '点击添加备注'}
                      </div>
                    )}
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
