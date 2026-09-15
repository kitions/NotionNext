import { useEffect, useState } from 'react'

/**
 * 服务端渲染和客户端首次渲染时返回 false，挂载完成后返回 true。
 */
export default function useHydrated() {
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  return isHydrated
}
