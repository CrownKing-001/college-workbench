import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * 判断当前是不是窄屏。
 * 初始值用惰性初始化直接读 window，避免在 effect 里同步 setState
 * （那会多触发一轮渲染）；effect 只负责订阅变化。
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(
    () => typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT
  )

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
