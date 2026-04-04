import { useState } from 'react'

interface SearchBarProps {
  onSearch: (type: 'productName' | 'shopName', keyword: string) => void
}

export default function SearchBar({ onSearch }: SearchBarProps) {
  const [searchType, setSearchType] = useState<'productName' | 'shopName'>('productName')
  const [keyword, setKeyword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch(searchType, keyword)
  }

  const handleClear = () => {
    setKeyword('')
    onSearch(searchType, '')
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-center">
      <select
        value={searchType}
        onChange={(e) => setSearchType(e.target.value as 'productName' | 'shopName')}
        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="productName">商品名</option>
        <option value="shopName">店铺名</option>
      </select>

      <input
        type="text"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="输入关键词搜索..."
        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <button
        type="submit"
        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
      >
        搜索
      </button>

      {keyword && (
        <button
          type="button"
          onClick={handleClear}
          className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
        >
          清除
        </button>
      )}
    </form>
  )
}
