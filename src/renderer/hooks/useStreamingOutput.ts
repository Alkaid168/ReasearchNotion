import { useCallback, useEffect, useRef, useState } from 'react'
import type { StreamSpeed } from '../../shared/types'

/** 打字机 tick 间隔(ms):光标在每个 tick 之间有稳定的闪烁窗口。 */
export const STREAM_TICK_MS = 25
/** 正常速率:每 tick 显示字符数(≈160 字/秒,略快于阅读)。 */
export const STREAM_RATE = 4
/** 积压超过此值(字符数)进入加速档。 */
export const STREAM_ACCEL_BACKLOG = 120
/** 加速档速率:每 tick 显示字符数。 */
export const STREAM_ACCEL_RATE = 12
/**
 * 积压超过此值(字符数)直接全量吐出。这是防极端欠账的保险丝,阈值远高于
 * 单条回答(数百字),正常回答不触发——否则真实流的大块到达会把各档速率
 * 全部拉平到网络到达率,速度档形同虚设。
 */
export const STREAM_FLUSH_BACKLOG = 800
/** finish 后欠账排空的快进速率(≈1280 字/秒):优雅在生成过程,收尾不拖沓。 */
export const STREAM_FINISH_RATE = 32

/**
 * 三档速度表:gentle 慢到低于典型生成速率(1 字/tick ≈ 40 字/秒,GPT 打字机
 * 节奏),体感与 normal 明显拉开;fast 用 Infinity 走同一条路径——
 * `Math.min(shown + Infinity, len) = len`,一次全吐、零特判,也不排程定时器。
 */
const SPEED_RATES: Record<StreamSpeed, { base: number; accel: number }> = {
  gentle: { base: 1, accel: 2 },
  normal: { base: STREAM_RATE, accel: STREAM_ACCEL_RATE },
  fast: { base: Number.POSITIVE_INFINITY, accel: Number.POSITIVE_INFINITY }
}

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
 * 防积压:积压越多吐得越快,超过保险丝阈值(800 字)才直通。push 时同步吐出
 * 第一片(首字零延迟),之后由定时器按 tick 节奏继续;finish 表示流已结束、
 * 内容已全部到达,欠账继续排空,排空完成后置 drained,供调用方无缝落库切换
 * (streaming 版变历史消息,文本相同、视觉连续)。
 *
 * `speed` 三档(gentle 半速 / normal 常规 / fast 直通),由 `SPEED_RATES` 统一
 * 表达;切换档位后下一 tick 即按新速率推进,fast 档在 push 内一次全吐。
 */
export function useStreamingOutput(speed: StreamSpeed = 'normal'): StreamOutput {
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
    const rates = SPEED_RATES[speed]
    let rate: number
    if (finishedRef.current) {
      rate = STREAM_FINISH_RATE
    } else if (backlog > STREAM_FLUSH_BACKLOG) {
      rate = backlog
    } else if (backlog > STREAM_ACCEL_BACKLOG) {
      rate = rates.accel
    } else {
      rate = rates.base
    }
    shownRef.current = Math.min(shownRef.current + rate, full.length)
    setContent(full.slice(0, shownRef.current))
    if (shownRef.current >= full.length && finishedRef.current) {
      stopTimer()
      setDrained(true)
    }
    return true
  }, [stopTimer, speed])

  // interval 回调经 ref 取最新 tick:切换档位后,下一 tick 立即按新速率推进,
  // 无需重建定时器(闭包直接捕获 tick 会锁死旧速率)。
  const tickRef = useRef(tick)
  useEffect(() => {
    tickRef.current = tick
  }, [tick])

  const ensureTimer = useCallback(() => {
    if (timerRef.current === null) {
      timerRef.current = setInterval(() => {
        if (!tickRef.current()) stopTimer()
      }, STREAM_TICK_MS)
    }
  }, [stopTimer])

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
      // 仍有积压才排程定时器:fast 档同步全吐后无需空转一个 tick。
      if (fullTextRef.current.length > shownRef.current) ensureTimer()
    },
    [ensureTimer, tick]
  )

  const finish = useCallback(
    (finalText: string) => {
      // 流已结束、内容全部到达。慢档(gentle)可能还有积压未显示:以快进速率
      // (STREAM_FINISH_RATE)排空剩余,排空完成后再置 drained,由调用方把最终
      // 全文落库为历史消息并 reset 清掉流式版本——文字打到最后一个字才定格,
      // 优雅节奏在生成过程,收尾快进不拖沓。
      fullTextRef.current = finalText
      finishedRef.current = true
      if (shownRef.current >= finalText.length) {
        stopTimer()
        setDrained(true)
      } else {
        ensureTimer()
      }
    },
    [ensureTimer, stopTimer]
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
