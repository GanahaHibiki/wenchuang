import { Routes, Route } from 'react-router-dom'
import MainLayout from './components/layout/MainLayout'
import HomePage from './pages/HomePage'
import OrderEntryPage from './pages/OrderEntryPage'
import OrderListPage from './pages/OrderListPage'
import OrderDetailPage from './pages/OrderDetailPage'
import ProductDetailPage from './pages/ProductDetailPage'
import ShopListPage from './pages/ShopListPage'

function App() {
  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/order-entry" element={<OrderEntryPage />} />
        <Route path="/orders" element={<OrderListPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/shops" element={<ShopListPage />} />
      </Routes>
    </MainLayout>
  )
}

export default App
