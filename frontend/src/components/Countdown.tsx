import { useEffect, useRef, useState } from 'react'

interface Props {
  endsAt: string | null
  pausedSeconds: number | null
  status: string
  large?: boolean
  onComplete?: () => void
}

export function remainingSeconds(endsAt: string | null, pausedSeconds: number | null, status: string, now = Date.now()) {
  if (status === 'paused') return Math.max(0, pausedSeconds ?? 0)
  if (!endsAt || status !== 'live') return 0
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 1000))
}

export function Countdown({ endsAt, pausedSeconds, status, large = false, onComplete }: Props) {
  const [seconds, setSeconds] = useState(() => remainingSeconds(endsAt, pausedSeconds, status))
  const completedRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    completedRef.current = false
    setSeconds(remainingSeconds(endsAt, pausedSeconds, status))
    if (status !== 'live' || !endsAt) return
    const interval = window.setInterval(() => {
      const next = remainingSeconds(endsAt, pausedSeconds, status)
      setSeconds(next)
      if (next === 0 && !completedRef.current) {
        completedRef.current = true
        onCompleteRef.current?.()
      }
    }, 250)
    return () => window.clearInterval(interval)
  }, [endsAt, pausedSeconds, status])

  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remainder = (seconds % 60).toString().padStart(2, '0')
  return (
    <span className={`tabular-nums ${large ? 'font-display text-5xl font-extrabold sm:text-7xl' : 'font-display text-2xl font-extrabold'}`} aria-label={`${minutes} minutos y ${remainder} segundos restantes`}>
      {minutes}:{remainder}
    </span>
  )
}
