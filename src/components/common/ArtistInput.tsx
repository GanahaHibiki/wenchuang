import { useId } from 'react'

interface ArtistInputProps {
  value?: string
  onChange: (value: string) => void
  disabled?: boolean
}

export default function ArtistInput({ value, onChange, disabled = false }: ArtistInputProps) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        美工作者（选填）
      </label>
      <input
        id={id}
        type="text"
        value={value || ''}
        onChange={event => onChange(event.target.value)}
        disabled={disabled}
        maxLength={120}
        placeholder="请输入美工作者名称"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}
