import { useRef, type ReactNode } from 'react'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import Sidebar from './Sidebar'

interface MainLayoutProps {
  children: ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  const mainRef = useRef<HTMLElement>(null)
  useScrollRestoration(mainRef)

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />
      <main ref={mainRef} className="flex-1 p-6 overflow-auto ml-48">
        {children}
      </main>
    </div>
  )
}
