import { useId } from 'react'
import { PRODUCT_STYLES, type ProductStyle } from '@/types'

interface StyleInputProps {
  value?: ProductStyle | ''
  onChange: (style: ProductStyle | '') => void
  disabled?: boolean
}

export default function StyleInput({ value, onChange, disabled = false }: StyleInputProps) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">风格分类（选填）</label>
      <select id={id} value={value || ''} disabled={disabled}
        onChange={event => onChange(event.target.value as ProductStyle | '')}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option value="">未分类（可清除）</option>
        {PRODUCT_STYLES.map(style => <option key={style} value={style}>{style}</option>)}
      </select>
    </div>
  )
}
