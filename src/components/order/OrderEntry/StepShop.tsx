interface StepShopProps {
  shopName: string
  onChange: (name: string) => void
  onNext: () => void
}

export default function StepShop({ shopName, onChange, onNext }: StepShopProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (shopName.trim()) {
      onNext()
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-6">第一步：店铺信息</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            店铺名称 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={shopName}
            onChange={(e) => onChange(e.target.value)}
            placeholder="请输入店铺名称"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <button
          type="submit"
          disabled={!shopName.trim()}
          className={`w-full py-2 rounded-lg text-white ${
            shopName.trim()
              ? 'bg-blue-500 hover:bg-blue-600'
              : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          确认并进入下一步
        </button>
      </form>
    </div>
  )
}
