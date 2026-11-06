import { useRef, type ReactNode } from 'react'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'

interface MainLayoutProps {
  children: ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  const mainRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  useScrollRestoration(mainRef)

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />
      <main ref={mainRef} className={`flex-1 p-6 ml-48 ${pathname === '/orders' ? 'min-w-0 overflow-visible' : 'overflow-auto'}`}>
        {children}
      </main>
    </div>
  )
}
