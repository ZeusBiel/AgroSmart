import { useEffect, useRef, useState } from 'react'

/** Largura observada de um elemento, para gráficos responsivos. */
export function useElementWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(240, Math.floor(entry.contentRect.width)))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}
