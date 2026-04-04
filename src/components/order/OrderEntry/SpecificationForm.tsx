import { useState } from 'react'
import type { Specification, SpecificationType, GiftType } from '@/types'
import { SPECIFICATION_TYPES, MULTI_ENTRY_TYPES } from '@/types'

interface SpecificationFormProps {
  specifications: Specification[]
  onChange: (specs: Specification[]) => void
  showPurchasePrice: boolean // true for purchased items, false for gifts/small gifts
}

export default function SpecificationForm({
  specifications,
  onChange,
  showPurchasePrice,
}: SpecificationFormProps) {
  const [selectedTypes, setSelectedTypes] = useState<Set<SpecificationType>>(
    new Set(specifications.map((s) => s.type))
  )

  // Group specs by type
  const specsByType = new Map<SpecificationType, Specification[]>()
  for (const spec of specifications) {
    if (!specsByType.has(spec.type)) {
      specsByType.set(spec.type, [])
    }
    specsByType.get(spec.type)!.push(spec)
  }

  const toggleType = (type: SpecificationType) => {
    const newSelected = new Set(selectedTypes)

    if (newSelected.has(type)) {
      newSelected.delete(type)
      // Remove all specs of this type
      onChange(specifications.filter((s) => s.type !== type))
    } else {
      newSelected.add(type)
      // Add initial spec for this type
      const newSpec: Specification = {
        type,
        sequenceNumber: 1,
        quantity: 1,
        originalPrice: 0,
        ...(showPurchasePrice ? { purchasePrice: 0 } : {}),
      }
      onChange([...specifications, newSpec])
    }

    setSelectedTypes(newSelected)
  }

  const updateSpec = (
    type: SpecificationType,
    seqNum: number,
    field: keyof Specification,
    value: number | string
  ) => {
    const newSpecs = specifications.map((s) =>
      s.type === type && s.sequenceNumber === seqNum ? { ...s, [field]: value } : s
    )
    onChange(newSpecs)
  }

  const addMultiEntry = (type: SpecificationType) => {
    const existing = specsByType.get(type) || []
    const maxSeq = Math.max(0, ...existing.map((s) => s.sequenceNumber))
    const newSpec: Specification = {
      type,
      sequenceNumber: maxSeq + 1,
      quantity: 1,
      originalPrice: 0,
      ...(showPurchasePrice ? { purchasePrice: 0 } : {}),
    }
    onChange([...specifications, newSpec])
  }

  const removeMultiEntry = (type: SpecificationType, seqNum: number) => {
    const remaining = specifications.filter(
      (s) => !(s.type === type && s.sequenceNumber === seqNum)
    )
    // If no more of this type, unselect it
    if (!remaining.some((s) => s.type === type)) {
      setSelectedTypes((prev) => {
        const newSet = new Set(prev)
        newSet.delete(type)
        return newSet
      })
    }
    onChange(remaining)
  }

  return (
    <div className="space-y-4">
      {/* Type selection */}
      <div className="grid grid-cols-4 gap-2">
        {SPECIFICATION_TYPES.map((type) => (
          <label
            key={type}
            className={`flex items-center gap-2 p-2 rounded border cursor-pointer ${
              selectedTypes.has(type) ? 'bg-blue-50 border-blue-500' : 'border-gray-300'
            }`}
          >
            <input
              type="checkbox"
              checked={selectedTypes.has(type)}
              onChange={() => toggleType(type)}
              className="w-4 h-4"
            />
            <span className="text-sm">{type}</span>
          </label>
        ))}
      </div>

      {/* Spec details */}
      {Array.from(selectedTypes).map((type) => {
        const specs = specsByType.get(type) || []
        const isMultiEntry = MULTI_ENTRY_TYPES.includes(type)

        return (
          <div key={type} className="border rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium">{type}</h4>
              {isMultiEntry && (
                <button
                  type="button"
                  onClick={() => addMultiEntry(type)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  + 添加更多
                </button>
              )}
            </div>

            {specs.map((spec) => (
              <div
                key={`${spec.type}-${spec.sequenceNumber}`}
                className="flex items-center gap-4 mb-2 last:mb-0"
              >
                {isMultiEntry && (
                  <span className="text-sm text-gray-500 w-16">
                    {type}{spec.sequenceNumber}
                  </span>
                )}

                {/* Custom type name input for "其他衍生" */}
                {type === '其他衍生' && (
                  <label className="flex items-center gap-1">
                    <span className="text-sm text-gray-600">类别名称:</span>
                    <input
                      type="text"
                      value={spec.customType || ''}
                      onChange={(e) =>
                        updateSpec(type, spec.sequenceNumber, 'customType', e.target.value)
                      }
                      placeholder="请输入自定义类别"
                      className="w-32 px-2 py-1 border rounded"
                    />
                  </label>
                )}

                <label className="flex items-center gap-1">
                  <span className="text-sm text-gray-600">数量:</span>
                  <input
                    type="number"
                    min="1"
                    value={spec.quantity}
                    onChange={(e) =>
                      updateSpec(type, spec.sequenceNumber, 'quantity', parseInt(e.target.value) || 1)
                    }
                    className="w-20 px-2 py-1 border rounded"
                  />
                </label>

                {showPurchasePrice && (
                  <label className="flex items-center gap-1">
                    <span className="text-sm text-gray-600">购入价:</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={spec.purchasePrice || 0}
                      onChange={(e) =>
                        updateSpec(
                          type,
                          spec.sequenceNumber,
                          'purchasePrice',
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-24 px-2 py-1 border rounded"
                    />
                  </label>
                )}

                <label className="flex items-center gap-1">
                  <span className="text-sm text-gray-600">原价:</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={spec.originalPrice}
                    onChange={(e) =>
                      updateSpec(
                        type,
                        spec.sequenceNumber,
                        'originalPrice',
                        parseFloat(e.target.value) || 0
                      )
                    }
                    className="w-24 px-2 py-1 border rounded"
                  />
                </label>

                {isMultiEntry && specs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMultiEntry(type, spec.sequenceNumber)}
                    className="text-red-500 hover:text-red-700"
                  >
                    删除
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
