import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { orderApi } from '@/api/client'
import type { OrderDetail, OrderItem, Product } from '@/types'
import ImageViewer from '@/components/common/ImageViewer'
import LazyImage from '@/components/common/LazyImage'
import OrderItemEditor from '@/components/order/OrderItemEditor'
import GroupOrderItemEditor from '@/components/order/GroupOrderItemEditor'
import { sortSpecifications } from '@/utils/specificationSort'

type ExtendedOrderDetail = OrderDetail & { groupSequenceNumber?: number; groupOrderName?: string }

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [order, setOrder] = useState<ExtendedOrderDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewingImage, setViewingImage] = useState<string | null>(null)
  const [editingCategory, setEditingCategory] = useState<'purchased' | 'gift' | 'smallGift' | 'groupOrder' | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isEditingShopName, setIsEditingShopName] = useState(false)
  const [editedShopName, setEditedShopName] = useState('')
  const [isEditingGroupOrderName, setIsEditingGroupOrderName] = useState(false)
  const [editedGroupOrderName, setEditedGroupOrderName] = useState('')

  useEffect(() => {
    if (!id) return

    const loadOrder = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const data = await orderApi.getDetail(id)
        setOrder(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败')
      } finally {
        setIsLoading(false)
      }
    }

    loadOrder()
  }, [id])

  const handleSaveItems = async (
    category: 'purchased' | 'gift' | 'smallGift',
    updatedItems: (OrderItem & { product: Product })[],
    newImages: Map<string, File>
  ) => {
    if (!order || !id) return

    setIsSaving(true)
    try {
      // Prepare FormData
      const formData = new FormData()

      // Prepare items data based on category
      const purchased = category === 'purchased' ? updatedItems : order.purchasedItems
      const gifts = category === 'gift' ? updatedItems : order.gifts
      const smallGifts = category === 'smallGift' ? updatedItems : order.smallGifts

      // Convert to the format expected by the API
      const purchasedData = purchased.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        specifications: item.specifications,
      }))

      const giftsData = gifts.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        giftType: item.giftType,
        customGiftType: item.customGiftType,
        specifications: item.specifications,
      }))

      const smallGiftsData = smallGifts.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        specifications: item.specifications,
      }))

      formData.append('purchasedItems', JSON.stringify(purchasedData))
      formData.append('gifts', JSON.stringify(giftsData))
      formData.append('smallGifts', JSON.stringify(smallGiftsData))

      // Add images for updated items
      let imageIndex = 0
      for (const [itemId, file] of newImages.entries()) {
        const itemList = category === 'purchased' ? purchased : category === 'gift' ? gifts : smallGifts
        const itemIndex = itemList.findIndex(item => item.id === itemId)
        if (itemIndex !== -1) {
          const fieldName = category === 'purchased'
            ? `purchasedImage_${itemIndex}`
            : category === 'gift'
            ? `giftImage_${itemIndex}`
            : `smallGiftImage_${itemIndex}`
          formData.append(fieldName, file)
        }
      }

      await orderApi.update(id, formData)

      // Reload order data
      const refreshedOrder = await orderApi.getDetail(id)
      setOrder(refreshedOrder)
      setEditingCategory(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveGroupOrder = async (
    updatedGroups: Array<{
      shopId: string
      shopName: string
      items: (OrderItem & { product: Product })[]
    }>,
    newImages: Map<string, File>
  ) => {
    if (!order || !id) return

    setIsSaving(true)
    try {
      const formData = new FormData()
      formData.append('orderType', 'group')

      // Flatten items from all shops
      const allItems: any[] = []
      const shopNameMap: Record<string, string> = {}

      for (const group of updatedGroups) {
        shopNameMap[group.shopId] = group.shopName
        for (const item of group.items) {
          allItems.push({
            id: item.id,
            productId: item.productId,
            productName: item.product.name,
            specifications: item.specifications,
            shopId: item.shopId,
          })
        }
      }

      formData.append('items', JSON.stringify(allItems))
      formData.append('shopIds', JSON.stringify(updatedGroups.map(g => g.shopId)))
      formData.append('shopNames', JSON.stringify(shopNameMap))

      // Add images with naming: item_{itemId}
      for (const [itemId, file] of newImages.entries()) {
        formData.append(`item_${itemId}`, file)
      }

      await orderApi.update(id, formData)

      // Reload order data
      const refreshedOrder = await orderApi.getDetail(id)
      setOrder(refreshedOrder)
      setEditingCategory(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveShopName = async () => {
    if (!order || !id || !editedShopName.trim()) return

    setIsSaving(true)
    try {
      const formData = new FormData()
      formData.append('shopName', editedShopName.trim())

      // Keep existing items
      const purchasedData = order.purchasedItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        specifications: item.specifications,
      }))

      const giftsData = order.gifts.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        giftType: item.giftType,
        customGiftType: item.customGiftType,
        specifications: item.specifications,
      }))

      const smallGiftsData = order.smallGifts.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product.name,
        specifications: item.specifications,
      }))

      formData.append('purchasedItems', JSON.stringify(purchasedData))
      formData.append('gifts', JSON.stringify(giftsData))
      formData.append('smallGifts', JSON.stringify(smallGiftsData))

      await orderApi.update(id, formData)

      // Reload order data
      const refreshedOrder = await orderApi.getDetail(id)
      setOrder(refreshedOrder)
      setIsEditingShopName(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveGroupOrderName = async () => {
    if (!order || !id || !editedGroupOrderName.trim()) return

    setIsSaving(true)
    try {
      await orderApi.updateGroupOrderName(id, editedGroupOrderName.trim())

      // Reload order data
      const refreshedOrder = await orderApi.getDetail(id)
      setOrder(refreshedOrder)
      setIsEditingGroupOrderName(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteOrder = async () => {
    if (!id) return

    const confirmed = window.confirm('确定要删除这个订单吗？此操作无法撤销。')
    if (!confirmed) return

    setIsDeleting(true)
    try {
      await orderApi.delete(id)
      alert('订单已删除')
      navigate('/orders')
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败')
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">加载中...</div>
  }

  if (error || !order) {
    return <div className="text-center py-12 text-red-500">{error || '订单不存在'}</div>
  }

  // Helper function to display specification type with custom name
  const getSpecTypeName = (spec: { type: string; customType?: string }) => {
    if ((spec.type === '其他衍生' || spec.type === '其他贴纸') && spec.customType) {
      return spec.customType
    }
    return spec.type
  }

  const renderItem = (item: OrderItem & { product: Product }, showPurchasePrice: boolean) => {
    // Sort specifications by display order
    const sortedSpecs = sortSpecifications(item.specifications)

    // Check which spec types have multiple entries
    const specTypeCounts = new Map<string, number>()
    sortedSpecs.forEach(spec => {
      const typeName = getSpecTypeName(spec)
      specTypeCounts.set(typeName, (specTypeCounts.get(typeName) || 0) + 1)
    })

    return (
      <div key={item.id} className="bg-gray-50 rounded-lg p-3 flex flex-col">
        <div
          className="w-full aspect-[4/3] bg-gray-200 rounded overflow-hidden cursor-pointer mb-2"
          onClick={() => setViewingImage(`/images/original/${item.product.imagePath}`)}
        >
          <LazyImage
            src={`/images/thumbnails/${item.product.thumbnailPath}`}
            alt={item.product.name}
            className="w-full h-full object-cover"
          />
        </div>
        <Link
          to={`/products/${item.product.id}`}
          className="font-medium text-blue-600 hover:underline text-sm mb-2 line-clamp-2"
        >
          {item.product.name}
        </Link>
        <div className="space-y-1">
          {sortedSpecs.map((spec, index) => {
            const typeName = getSpecTypeName(spec)
            const hasMultiple = (specTypeCounts.get(typeName) || 0) > 1

            return (
              <div key={index} className="text-xs text-gray-600">
                {typeName}
                {hasMultiple && spec.sequenceNumber}:
                {' '}{spec.quantity} 个
                {showPurchasePrice && spec.purchasePrice !== undefined && (
                  <> × ¥{spec.purchasePrice.toFixed(2)} = ¥{(spec.quantity * spec.purchasePrice).toFixed(2)}</>
                )}
                {!showPurchasePrice && (
                  <> × ¥{spec.originalPrice.toFixed(2)} = ¥{(spec.quantity * spec.originalPrice).toFixed(2)}</>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Group gifts by type and maintain order
  const giftsByType = order.gifts.reduce((acc, gift) => {
    const type = gift.giftType === '其他' && gift.customGiftType
      ? gift.customGiftType
      : gift.giftType || '其他'
    if (!acc[type]) acc[type] = []
    acc[type].push(gift)
    return acc
  }, {} as Record<string, typeof order.gifts>)

  // Render gift items with type labels above first item of each type
  const renderGiftsWithLabels = () => {
    const elements: JSX.Element[] = []

    Object.entries(giftsByType).forEach(([type, gifts]) => {
      gifts.forEach((item, index) => {
        const isFirstOfType = index === 0
        elements.push(
          <div key={item.id} className="relative mt-8">
            {isFirstOfType && (
              <div className="absolute -top-8 left-0 text-md font-medium text-gray-700">
                [{type}]
              </div>
            )}
            {renderItem(item, false)}
          </div>
        )
      })
    })

    return elements
  }

  // Render group order items with shop labels above first item of each shop
  const renderGroupOrderItems = () => {
    if (!order.shops) return []

    const elements: JSX.Element[] = []

    order.shops.forEach((shop) => {
      const shopItems = order.purchasedItems.filter(
        (item) => item.shopId === shop.id
      )
      if (shopItems.length === 0) return

      shopItems.forEach((item, index) => {
        const isFirstOfShop = index === 0
        elements.push(
          <div key={item.id} className="relative mt-8">
            {isFirstOfShop && (
              <div className="absolute -top-8 left-0 text-md font-medium text-gray-700">
                店铺：{shop.name}
              </div>
            )}
            {renderItem(item, true)}
          </div>
        )
      })
    })

    return elements
  }

  // Determine which sequence number to display
  const displaySequenceNumber = order.orderType === 'group'
    ? order.groupSequenceNumber || order.sequenceNumber
    : order.sequenceNumber

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">
            {order.orderType === 'group' ? '拼单' : '订单'} #{displaySequenceNumber} -
          </h1>
          {order.orderType === 'group' ? (
            isEditingGroupOrderName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editedGroupOrderName}
                  onChange={(e) => setEditedGroupOrderName(e.target.value)}
                  className="px-3 py-1 border rounded-md text-xl font-bold"
                  autoFocus
                />
                <button
                  onClick={handleSaveGroupOrderName}
                  disabled={isSaving || !editedGroupOrderName.trim()}
                  className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
                >
                  保存
                </button>
                <button
                  onClick={() => {
                    setIsEditingGroupOrderName(false)
                    setEditedGroupOrderName(order.groupOrderName || '拼单')
                  }}
                  className="px-3 py-1 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 text-sm"
                >
                  取消
                </button>
              </div>
            ) : (
              <>
                <span className="text-2xl font-bold">{order.groupOrderName || '拼单'}</span>
                <button
                  onClick={() => {
                    setIsEditingGroupOrderName(true)
                    setEditedGroupOrderName(order.groupOrderName || '拼单')
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  编辑
                </button>
              </>
            )
          ) : isEditingShopName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editedShopName}
                onChange={(e) => setEditedShopName(e.target.value)}
                className="px-3 py-1 border rounded-md text-xl font-bold"
                autoFocus
              />
              <button
                onClick={handleSaveShopName}
                disabled={isSaving || !editedShopName.trim()}
                className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
              >
                保存
              </button>
              <button
                onClick={() => {
                  setIsEditingShopName(false)
                  setEditedShopName(order.shop?.name || '')
                }}
                className="px-3 py-1 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 text-sm"
              >
                取消
              </button>
            </div>
          ) : (
            <>
              <span className="text-2xl font-bold">{order.shop?.name || '未知店铺'}</span>
              <button
                onClick={() => {
                  setIsEditingShopName(true)
                  setEditedShopName(order.shop?.name || '')
                }}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                编辑
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDeleteOrder}
            disabled={isDeleting}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? '删除中...' : '删除订单'}
          </button>
          <Link
            to="/orders"
            className="text-blue-500 hover:underline"
          >
            返回列表
          </Link>
        </div>
      </div>

      {/* Summary */}
      <section className="bg-blue-50 rounded-lg p-6">
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-sm text-gray-600">订单金额</div>
            <div className="text-xl font-bold text-blue-600">
              ¥{order.totalAmount.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">礼品总价</div>
            <div className="text-xl font-bold text-orange-600">
              ¥{(order.giftTotal || 0).toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">小礼物总价</div>
            <div className="text-xl font-bold text-green-600">
              ¥{order.smallGiftTotal.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-600">小礼物占比</div>
            <div className="text-xl font-bold text-purple-600">
              {order.totalAmount > 0 ? `${order.giftRatio.toFixed(1)}%` : '-'}
            </div>
          </div>
        </div>
      </section>

      {/* Purchased Items */}
      <section className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">已购商品</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{order.purchasedItems.length} 件</span>
            {order.orderType === 'group' ? (
              <button
                onClick={() => setEditingCategory('groupOrder')}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                编辑
              </button>
            ) : (
              <button
                onClick={() => setEditingCategory('purchased')}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                编辑
              </button>
            )}
          </div>
        </div>

        {order.orderType === 'group' && order.shops ? (
          // Group order: display all items with shop labels above first item of each shop
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,230px))] gap-4 justify-center">
            {renderGroupOrderItems()}
          </div>
        ) : (
          // Regular shop order
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,230px))] gap-4 justify-center">
            {order.purchasedItems.length === 0 ? (
              <p className="text-gray-500 col-span-full">暂无已购商品</p>
            ) : (
              order.purchasedItems.map((item) => renderItem(item, true))
            )}
          </div>
        )}
      </section>

      {/* Gifts */}
      {order.orderType !== 'group' && (
        <section className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">礼品</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{order.gifts.length} 件</span>
              <button
                onClick={() => setEditingCategory('gift')}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                编辑
              </button>
            </div>
          </div>
          {order.gifts.length === 0 ? (
            <div>
              <p className="text-gray-500">暂无礼品</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,230px))] gap-4 justify-center">
              {renderGiftsWithLabels()}
            </div>
          )}
        </section>
      )}

      {/* Small Gifts */}
      {order.orderType !== 'group' && (
        <section className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">小礼物</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{order.smallGifts.length} 件</span>
              <button
                onClick={() => setEditingCategory('smallGift')}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                编辑
              </button>
            </div>
          </div>
          {order.smallGifts.length === 0 ? (
            <div>
              <p className="text-gray-500">暂无小礼物</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,230px))] gap-4 justify-center">
              {order.smallGifts.map((item) => renderItem(item, false))}
            </div>
          )}
        </section>
      )}

      {/* Image Viewer */}
      {viewingImage && (
        <ImageViewer
          src={viewingImage}
          onClose={() => setViewingImage(null)}
        />
      )}

      {/* Order Item Editor */}
      {editingCategory && order && (() => {
        // Group order editing
        if (editingCategory === 'groupOrder' && order.orderType === 'group' && order.shops) {
          const shopGroups = order.shops.map(shop => ({
            shopId: shop.id,
            shopName: shop.name,
            items: order.purchasedItems.filter(item => item.shopId === shop.id)
          }))

          // Collect all existing products
          const allProducts = order.purchasedItems.map(item => ({
            productId: item.productId,
            productName: item.product.name,
            imagePath: item.product.imagePath,
            thumbnailPath: item.product.thumbnailPath
          }))

          const uniqueProducts = allProducts.filter((product, index, self) => {
            const productNameLower = product.productName.trim().toLowerCase()
            return index === self.findIndex(p => p.productName.trim().toLowerCase() === productNameLower)
          })

          return (
            <GroupOrderItemEditor
              shopGroups={shopGroups}
              onSave={handleSaveGroupOrder}
              onCancel={() => setEditingCategory(null)}
              existingProducts={uniqueProducts}
            />
          )
        }

        // Regular order editing
        // Build and deduplicate existing products list
        const allProducts = [
          ...order.purchasedItems.map(item => ({
            productId: item.productId,
            productName: item.product.name,
            imagePath: item.product.imagePath,
            thumbnailPath: item.product.thumbnailPath
          })),
          ...(editingCategory !== 'purchased' ? order.gifts.map(item => ({
            productId: item.productId,
            productName: item.product.name,
            imagePath: item.product.imagePath,
            thumbnailPath: item.product.thumbnailPath
          })) : []),
          ...(editingCategory === 'smallGift' ? order.smallGifts.map(item => ({
            productId: item.productId,
            productName: item.product.name,
            imagePath: item.product.imagePath,
            thumbnailPath: item.product.thumbnailPath
          })) : [])
        ]

        // Deduplicate by product name (case-insensitive)
        const uniqueProducts = allProducts.filter((product, index, self) => {
          const productNameLower = product.productName.trim().toLowerCase()
          return index === self.findIndex(p => p.productName.trim().toLowerCase() === productNameLower)
        })

        return (
          <OrderItemEditor
            items={
              editingCategory === 'purchased'
                ? order.purchasedItems
                : editingCategory === 'gift'
                ? order.gifts
                : order.smallGifts
            }
            category={editingCategory}
            onSave={(items, images) => handleSaveItems(editingCategory, items, images)}
            onCancel={() => setEditingCategory(null)}
            shopName={order.shop?.name || '拼单'}
            existingProducts={uniqueProducts}
          />
        )
      })()}

      {/* Saving Overlay */}
      {isSaving && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6">
            <div className="text-center">保存中...</div>
          </div>
        </div>
      )}
    </div>
  )
}
