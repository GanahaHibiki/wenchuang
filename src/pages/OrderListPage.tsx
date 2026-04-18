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
  const [editingOrderTimeId, setEditingOrderTimeId] = useState<string | null>(null)
  const [orderTimeValue, setOrderTimeValue] = useState('')
  const [editingShippingTimeId, setEditingShippingTimeId] = useState<string | null>(null)
  const [shippingTimeValue, setShippingTimeValue] = useState('')

  useEffect(() => {
    loadOrders()
  }, [sortField, sortOrder])

  const loadOrders = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // When sortField is set, backend sorts by that field
      // When sortField is null, backend sorts by orderTime (if available) then sequenceNumber
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

  const handleOrderTimeClick = (order: OrderSummary, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingOrderTimeId(order.id)
    // Format orderTime to YYYY-MM-DD HH:mm:ss if it exists
    if (order.orderTime) {
      const date = new Date(order.orderTime)
      const formatted = date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0') + ' ' +
        String(date.getHours()).padStart(2, '0') + ':' +
        String(date.getMinutes()).padStart(2, '0') + ':' +
        String(date.getSeconds()).padStart(2, '0')
      setOrderTimeValue(formatted)
    } else {
      setOrderTimeValue('')
    }
  }

  const handleOrderTimeSave = async (orderId: string) => {
    try {
      // Convert YYYY-MM-DD HH:mm:ss to ISO string
      let isoString = ''
      if (orderTimeValue.trim()) {
        const date = new Date(orderTimeValue)
        if (isNaN(date.getTime())) {
          alert('时间格式错误，请使用 YYYY-MM-DD HH:mm:ss 格式')
          return
        }
        isoString = date.toISOString()
      }

      await fetch(`/api/orders/${orderId}/order-time`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderTime: isoString })
      })

      // Update local state and trigger re-sort
      setOrders(orders.map(o =>
        o.id === orderId ? { ...o, orderTime: isoString || undefined } : o
      ))
      setEditingOrderTimeId(null)

      // Reload to apply sorting
      loadOrders()
    } catch (err) {
      alert('保存失败')
    }
  }

  const handleOrderTimeKeyDown = (orderId: string, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleOrderTimeSave(orderId)
    } else if (e.key === 'Escape') {
      setEditingOrderTimeId(null)
      setOrderTimeValue('')
    }
  }

  const handleOrderTimeBlur = (orderId: string) => {
    handleOrderTimeSave(orderId)
  }

  const handleShippingTimeClick = (order: OrderSummary, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingShippingTimeId(order.id)
    // Format shippingTime to YYYY-MM-DD if it exists
    if (order.shippingTime) {
      const date = new Date(order.shippingTime)
      const formatted = date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0')
      setShippingTimeValue(formatted)
    } else {
      setShippingTimeValue('')
    }
  }

  const handleShippingTimeSave = async (orderId: string) => {
    try {
      // Convert YYYY-MM-DD to ISO string
      let isoString = ''
      if (shippingTimeValue.trim()) {
        const date = new Date(shippingTimeValue + 'T00:00:00')
        if (isNaN(date.getTime())) {
          alert('日期格式错误，请使用 YYYY-MM-DD 格式')
          return
        }
        isoString = date.toISOString()
      }

      await fetch(`/api/orders/${orderId}/shipping-time`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shippingTime: isoString })
      })

      // Update local state
      setOrders(orders.map(o =>
        o.id === orderId ? { ...o, shippingTime: isoString || undefined } : o
      ))
      setEditingShippingTimeId(null)
    } catch (err) {
      alert('保存失败')
    }
  }

  const handleShippingTimeKeyDown = (orderId: string, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleShippingTimeSave(orderId)
    } else if (e.key === 'Escape') {
      setEditingShippingTimeId(null)
      setShippingTimeValue('')
    }
  }

  const handleShippingTimeBlur = (orderId: string) => {
    handleShippingTimeSave(orderId)
  }

  // Calculate shipping duration in days
  const calculateShippingDuration = (order: OrderSummary): string => {
    if (!order.orderTime) return '-'

    const orderDate = new Date(order.orderTime)
    orderDate.setHours(0, 0, 0, 0)

    let endDate: Date
    if (order.shippingTime) {
      endDate = new Date(order.shippingTime)
      endDate.setHours(0, 0, 0, 0)
    } else {
      // Use Beijing time (UTC+8)
      const now = new Date()
      const beijingOffset = 8 * 60 // Beijing is UTC+8
      const localOffset = now.getTimezoneOffset()
      const beijingTime = new Date(now.getTime() + (beijingOffset + localOffset) * 60 * 1000)
      beijingTime.setHours(0, 0, 0, 0)
      endDate = beijingTime
    }

    const diffTime = endDate.getTime() - orderDate.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

    return `${diffDays}天`
  }

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">加载中...</div>
  }

  if (error) {
    return <div className="text-center py-12 text-red-500">{error}</div>
  }

  // Separate shop orders and group orders
  const shopOrders = orders.filter(order => order.orderType !== 'group')
  const groupOrders = orders.filter(order => order.orderType === 'group')

  const renderOrderTable = (orderList: OrderSummary[], title: string) => {
    if (orderList.length === 0) return null

    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">{title}</h2>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full table-fixed">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-[4%] px-2 py-3 text-left text-sm font-medium text-gray-700">
                  序号
                </th>
                <th className="w-[15%] px-8 py-3 text-left text-sm font-medium text-gray-700">
                  店铺名称
                </th>
                <th
                  className="w-[7%] px-4 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('totalAmount')}
                >
                  订单金额 {getSortIcon('totalAmount')}
                </th>
                <th
                  className="w-[7%] px-4 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('giftTotal')}
                >
                  礼品总价 {getSortIcon('giftTotal')}
                </th>
                <th className="w-[7%] px-4 py-3 text-left text-sm font-medium text-gray-700">
                  小礼物总价
                </th>
                <th
                  className="w-[7%] px-4 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('giftRatio')}
                >
                  小礼物占比 {getSortIcon('giftRatio')}
                </th>
                <th className="w-[11%] px-4 py-3 text-left text-sm font-medium text-gray-700">
                  下单时间
                </th>
                <th className="w-[7%] px-4 py-3 text-left text-sm font-medium text-gray-700">
                  发货时间
                </th>
                <th className="w-[7%] px-4 py-3 text-left text-sm font-medium text-gray-700">
                  发货时长
                </th>
                <th className="w-[7%] px-4 py-3 text-left text-sm font-medium text-gray-700">
                  到货情况
                </th>
                <th className="w-[21%] px-8 py-3 text-left text-sm font-medium text-gray-700">
                  备注
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orderList.map((order, index) => (
                <tr
                  key={order.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/orders/${order.id}`)}
                >
                  <td className="px-2 py-3">
                    {index + 1}
                  </td>
                  <td className="px-8 py-3 font-bold">{order.shopName}</td>
                  <td className="px-4 py-3">¥{order.totalAmount.toFixed(2)}</td>
                  <td className="px-4 py-3">¥{(order.giftTotal || 0).toFixed(2)}</td>
                  <td className="px-4 py-3">¥{order.smallGiftTotal.toFixed(2)}</td>
                  <td className="px-4 py-3 font-bold">
                    {order.totalAmount > 0 ? `${order.giftRatio.toFixed(1)}%` : '-'}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => handleOrderTimeClick(order, e)}>
                    {editingOrderTimeId === order.id ? (
                      <input
                        type="text"
                        value={orderTimeValue}
                        onChange={(e) => setOrderTimeValue(e.target.value)}
                        onKeyDown={(e) => handleOrderTimeKeyDown(order.id, e)}
                        onBlur={() => handleOrderTimeBlur(order.id)}
                        className="px-2 py-1 border rounded text-sm w-full"
                        placeholder="YYYY-MM-DD HH:mm:ss"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="min-h-[24px] cursor-pointer">
                        {order.orderTime ? new Date(order.orderTime).toLocaleString('zh-CN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: false
                        }).replace(/\//g, '-') : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => handleShippingTimeClick(order, e)}>
                    {editingShippingTimeId === order.id ? (
                      <input
                        type="text"
                        value={shippingTimeValue}
                        onChange={(e) => setShippingTimeValue(e.target.value)}
                        onKeyDown={(e) => handleShippingTimeKeyDown(order.id, e)}
                        onBlur={() => handleShippingTimeBlur(order.id)}
                        className="px-2 py-1 border rounded text-sm w-full"
                        placeholder="YYYY-MM-DD"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div className="min-h-[24px] cursor-pointer">
                        {order.shippingTime ? new Date(order.shippingTime).toLocaleDateString('zh-CN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit'
                        }).replace(/\//g, '-') : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-bold">
                    {calculateShippingDuration(order)}
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
                  <td className="px-8 py-3" onClick={(e) => handleNoteClick(order, e)}>
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
                      <div className="min-h-[24px] cursor-pointer font-bold">
                        {order.note || ''}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">订单总览</h1>

      {orders.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          暂无订单，请先<Link to="/order-entry" className="text-blue-500 hover:underline">录入订单</Link>
        </div>
      ) : (
        <div className="space-y-8">
          {renderOrderTable(shopOrders, '店铺订单')}
          {renderOrderTable(groupOrders, '拼单订单')}
        </div>
      )}
    </div>
  )
}
