import type {
  Shop,
  Product,
  Order,
  OrderSummary,
  OrderDetail,
  ProductDetail,
} from '@/types'

const API_BASE = '/api'

async function request<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(error.message || `HTTP error! status: ${response.status}`)
  }

  return response.json()
}

// ==================== Shop API ====================

export const shopApi = {
  getAll: () => request<Shop[]>('/shops'),

  create: (name: string) =>
    request<Shop>('/shops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
}

// ==================== Product API ====================

export const productApi = {
  getAll: () => request<Product[]>('/products'),

  search: (type: 'productName' | 'shopName', keyword: string) =>
    request<Product[]>(`/products/search?type=${type}&keyword=${encodeURIComponent(keyword)}`),

  getDetail: (id: string) => request<ProductDetail>(`/products/${id}`),
}

// ==================== Order API ====================

export const orderApi = {
  getAll: (sortBy?: 'totalAmount' | 'giftRatio', order?: 'asc' | 'desc') => {
    const params = new URLSearchParams()
    if (sortBy) params.append('sortBy', sortBy)
    if (order) params.append('order', order)
    const query = params.toString()
    return request<OrderSummary[]>(`/orders${query ? `?${query}` : ''}`)
  },

  getDetail: (id: string) => request<OrderDetail>(`/orders/${id}`),

  create: (formData: FormData) =>
    request<Order>('/orders', {
      method: 'POST',
      body: formData,
    }),

  update: (id: string, formData: FormData) =>
    request<Order>(`/orders/${id}`, {
      method: 'PUT',
      body: formData,
    }),
}

// ==================== Image API ====================

export const imageApi = {
  upload: async (file: File): Promise<{ imagePath: string; thumbnailPath: string }> => {
    const formData = new FormData()
    formData.append('image', file)
    return request('/images/upload', {
      method: 'POST',
      body: formData,
    })
  },

  getOriginalUrl: (path: string) => `/images/original/${path}`,
  getThumbnailUrl: (path: string) => `/images/thumbnails/${path}`,
}
