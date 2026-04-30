import { NavLink } from 'react-router-dom'

const menuItems = [
  { path: '/', label: '商品浏览', icon: '📦' },
  { path: '/set-products', label: 'Set商品浏览', icon: '🎁' },
  { path: '/shops', label: '已购店铺', icon: '🏪' },
  { path: '/wishes', label: '心愿浏览', icon: '⭐' },
  { path: '/wish-shops', label: '心愿店铺', icon: '💫' },
  { path: '/orders', label: '订单总览', icon: '📋' },
  { path: '/order-entry', label: '店铺订单录入', icon: '📝' },
  { path: '/group-order-entry', label: '拼单订单录入', icon: '🛒' },
]

export default function Sidebar() {
  return (
    <aside className="w-48 bg-gray-800 text-white min-h-screen fixed left-0 top-0 bottom-0 overflow-y-auto">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-bold">文创订单管理</h1>
      </div>
      <nav className="p-2">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-3 rounded-lg mb-1 transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700'
              }`
            }
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
