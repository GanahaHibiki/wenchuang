import { useNavigate } from 'react-router-dom'

interface BackButtonProps {
  fallback?: string
}

export default function BackButton({ fallback = '/' }: BackButtonProps) {
  const navigate = useNavigate()

  const goBack = () => {
    // Do not send a directly opened tab to an unrelated external history entry.
    if (typeof window.history.state?.idx === 'number' && window.history.state.idx > 0) {
      navigate(-1)
    } else {
      navigate(fallback, { replace: true })
    }
  }

  return (
    <button type="button" onClick={goBack} className="text-blue-500 hover:underline">
      返回上一页
    </button>
  )
}
