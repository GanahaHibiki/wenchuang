import type { Specification } from '@/types'
import { SPECIFICATION_DISPLAY_ORDER } from '@/types'

/**
 * Sort specifications by display order defined in SPECIFICATION_DISPLAY_ORDER
 * Within same type, sort by sequenceNumber
 */
export function sortSpecifications(specs: Specification[]): Specification[] {
  return [...specs].sort((a, b) => {
    const aIndex = SPECIFICATION_DISPLAY_ORDER.indexOf(a.type)
    const bIndex = SPECIFICATION_DISPLAY_ORDER.indexOf(b.type)

    // First sort by type order
    if (aIndex !== bIndex) {
      return aIndex - bIndex
    }

    // If same type, sort by sequence number
    return a.sequenceNumber - b.sequenceNumber
  })
}
