import { useCallback, useEffect, useRef, useState } from 'react'

/** 打字机 tick 间隔(ms):光标在每个 tick 之间有稳定的闪烁窗口。 */
export const STREAM_TICK_MS = 25
/** 正常速率:每 tick 显示字符数(≈160 字/秒,略快于阅读)。 */
export const STREAM_RATE = 4
/** 积压超过此值(字符数)进入加速档。 */
export const STREAM_ACCEL_BACKLOG = 80
/** 加速档速率:每 tick 显示字符数。 */
export const STREAM_ACCEL_RATE = 12
/** 积压超过此值(字符数)直接全量吐出,防止"假优雅"欠账。 */
export const STREAM_FLUSH_BACKLOG = 240

export type StreamOutput = {
  /** 当前应显示在流式消息中的文本;未开始时为 null。 */
  content: string | null
  /** finish 后是否已把最终全文全部显示完(此时可无缝落库切换)。 */
  drained: boolean
  push: (delta: string, opts?: { replace?: boolean }) => void
  finish: (finalText: string) => void
  reset: () => void
}

/**
 * 流式输出的本地节奏控制:到达的 delta 先进缓冲区,按平滑打字机节奏显示,
 * 而不是随网络 chunk 到达节奏一段段蹦出;光标因此获得稳定的展示窗口。
 *
 * 防积压:积压越多吐得越快,超过阈值直通。push 时同步吐出第一片(首字零延迟),
 * 之后由定时器按 tick 节奏继续;finish 表示流已结束、内容已全部到达,直接
 * 全量补全并置 drained,供调用方无缝落库切换(streaming 版变历史消息)。
 */
export function useStreamingOutput(): StreamOutput {
  const [content, setContent] = useState<string | null>(null)
  const [drained, setDrained] = useState(false)
  const fullTextRef = useRef('')
  const shownRef = useRef(0)
  const finishedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  /** 推进一次显示进度;返回 false 表示已排空完成、定时器应停止。 */
  const tick = useCallback((): boolean => {
    const full = fullTextRef.current
    const backlog = full.length - shownRef.current
    if (backlog <= 0) {
      if (finishedRef.current) {
        stopTimer()
        setDrained(true)
      }
      return false
    }
    let rate: number
    if (backlog > STREAM_FLUSH_BACKLOG) {
      rate = backlog
    } else if (backlog > STREAM_ACCEL_BACKLOG) {
      rate = STREAM_ACCEL_RATE
    } else {
      rate = STREAM_RATE
    }
    shownRef.current = Math.min(shownRef.current + rate, full.length)
    setContent(full.slice(0, shownRef.current))
    if (shownRef.current >= full.length && finishedRef.current) {
      stopTimer()
      setDrained(true)
    }
    return true
  }, [stopTimer])

  const ensureTimer = useCallback(() => {
    if (timerRef.current === null) {
      timerRef.current = setInterval(() => {
        if (!tick()) stopTimer()
      }, STREAM_TICK_MS)
    }
  }, [stopTimer, tick])

  const push = useCallback(
    (delta: string, opts?: { replace?: boolean }) => {
      if (finishedRef.current) return
      if (opts?.replace) {
        fullTextRef.current = delta
        shownRef.current = 0
        setContent('')
      } else {
        fullTextRef.current += delta
      }
      // 同步吐出第一片:首字零延迟,且不依赖定时器在测试/低优先级环境下被调度。
      tick()
      ensureTimer()
    },
    [ensureTimer, tick]
  )

  const finish = useCallback(
    (finalText: string) => {
      // 流已结束、内容全部到达:不再更新流式显示(避免"全文中间态"闪烁),
      // 直接置 drained,由调用方把最终全文落库为历史消息并 reset 清掉流式版本,
      // 视觉上消息在流结束瞬间定格。
      fullTextRef.current = finalText
      finishedRef.current = true
      shownRef.current = finalText.length
      stopTimer()
      setDrained(true)
    },
    [stopTimer]
  )

  const reset = useCallback(() => {
    stopTimer()
    fullTextRef.current = ''
    shownRef.current = 0
    finishedRef.current = false
    setContent(null)
    setDrained(false)
  }, [stopTimer])

  useEffect(() => stopTimer, [stopTimer])

  return { content, drained, push, finish, reset }
}
