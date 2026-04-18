import { Routes, Route } from 'react-router-dom'
import MainLayout from './components/layout/MainLayout'
import HomePage from './pages/HomePage'
import WishListPage from './pages/WishListPage'
import OrderEntryPage from './pages/OrderEntryPage'
import GroupOrderEntryPage from './pages/GroupOrderEntryPage'
import OrderListPage from './pages/OrderListPage'
import OrderDetailPage from './pages/OrderDetailPage'
import ProductDetailPage from './pages/ProductDetailPage'
import ShopListPage from './pages/ShopListPage'
import WishShopListPage from './pages/WishShopListPage'

function App() {
  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/wishes" element={<WishListPage />} />
        <Route path="/order-entry" element={<OrderEntryPage />} />
        <Route path="/group-order-entry" element={<GroupOrderEntryPage />} />
        <Route path="/orders" element={<OrderListPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/shops" element={<ShopListPage />} />
        <Route path="/wish-shops" element={<WishShopListPage />} />
      </Routes>
    </MainLayout>
  )
}

export default App
