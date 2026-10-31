import { Link } from 'react-router-dom'
import type { ProductDetail, ProductEntry, GiftType, Specification } from '@/types'
import { sortSpecifications } from '@/utils/specificationSort'

interface ProductOrderRecordsProps {
  entries: ProductDetail['entries']
  grouped?: boolean
}

const specName = (spec: Specification) =>
  (spec.type === '其他衍生' || spec.type === '其他贴纸') && spec.customType ? spec.customType : spec.type

const orderLabel = (entry: ProductEntry) => entry.orderType === 'group'
  ? `拼单 #${entry.groupSequenceNumber || entry.orderSequence} - ${entry.shopName}`
  : `订单 #${entry.orderSequence} - ${entry.shopName}`

export default function ProductOrderRecords({ entries, grouped = false }: ProductOrderRecordsProps) {
  const categories = [
    { key: 'purchased', title: '已购商品记录', records: entries.purchased, border: 'border-blue-500' },
    { key: 'gifts', title: '礼品记录', records: entries.gifts, border: 'border-green-500' },
    { key: 'smallGifts', title: '小礼物记录', records: entries.smallGifts, border: 'border-purple-500' },
  ]
  const Heading = grouped ? 'h3' : 'h2'
  if (categories.every(category => category.records.length === 0)) {
    return <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">该商品暂无订单记录</div>
  }

  return (
    <div className="space-y-6">
      {categories.filter(category => category.records.length > 0).map(category => (
        <section key={category.key} className="bg-white rounded-lg shadow p-6">
          <Heading className="text-lg font-bold mb-4">{category.title}</Heading>
          <div className="space-y-4">
            {category.records.map((entry, index) => {
              const specs = sortSpecifications(entry.specifications)
              const counts = new Map<string, number>()
              specs.forEach(spec => counts.set(specName(spec), (counts.get(specName(spec)) || 0) + 1))
              const giftType = (entry as ProductEntry & { giftType?: GiftType }).giftType
              return (
                <div key={index} className={`border-l-4 ${category.border} pl-4 py-2`}>
                  <Link to={`/orders/${entry.orderId}`} className="font-medium text-blue-600 hover:underline">
                    {orderLabel(entry)}
                  </Link>
                  {category.key === 'gifts' && (
                    <span className="ml-2 text-sm bg-green-100 text-green-700 px-2 py-0.5 rounded">{giftType}</span>
                  )}
                  <div className="mt-2 space-y-1">
                    {specs.filter(spec => spec.quantity > 0).map((spec, specIndex) => (
                      <div key={specIndex} className="text-sm text-gray-600">
                        {specName(spec)}{(counts.get(specName(spec)) || 0) > 1 && spec.sequenceNumber}:
                        {' '}{spec.quantity} 个,
                        {category.key === 'purchased' && <> 购入价 ¥{spec.purchasePrice?.toFixed(2) || '0.00'},</>}
                        {' '}原价 ¥{spec.originalPrice.toFixed(2)}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
