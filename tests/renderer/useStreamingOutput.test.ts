import '@testing-library/jest-dom/vitest'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  STREAM_ACCEL_BACKLOG,
  STREAM_ACCEL_RATE,
  STREAM_FINISH_RATE,
  STREAM_FLUSH_BACKLOG,
  STREAM_RATE,
  STREAM_TICK_MS,
  useStreamingOutput
} from '../../src/renderer/hooks/useStreamingOutput'
import type { StreamSpeed } from '../../src/shared/types'

describe('useStreamingOutput', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the first slice immediately, then reveals at a steady typing pace', () => {
    const { result } = renderHook(() => useStreamingOutput())
    act(() => {
      result.current.push('Hello, world!')
    })
    // push 同步吐出第一片:首字零延迟。
    expect(result.current.content).toBe('Hello, world!'.slice(0, STREAM_RATE))
    act(() => {
      vi.advanceTimersByTime(STREAM_TICK_MS)
    })
    expect(result.current.content).toBe('Hello, world!'.slice(0, STREAM_RATE * 2))
  })

  it('accelerates when the backlog grows and flushes through when huge', () => {
    const { result } = renderHook(() => useStreamingOutput())
    act(() => {
      result.current.push('x'.repeat(STREAM_ACCEL_BACKLOG + 20))
    })
    expect(result.current.content).toBe('x'.repeat(STREAM_ACCEL_RATE))
    act(() => {
      vi.advanceTimersByTime(STREAM_TICK_MS)
    })
    expect(result.current.content).toBe('x'.repeat(STREAM_ACCEL_RATE * 2))

    const huge = renderHook(() => useStreamingOutput())
    act(() => {
      huge.result.current.push('y'.repeat(STREAM_FLUSH_BACKLOG + 100))
    })
    expect(huge.result.current.content).toBe('y'.repeat(STREAM_FLUSH_BACKLOG + 100))
  })

  it('keeps typing the final text after finish until drained', () => {
    const { result } = renderHook(() => useStreamingOutput())
    act(() => {
      result.current.push('abc')
    })
    expect(result.current.content).toBe('abc')

    act(() => {
      result.current.finish('x'.repeat(200))
    })
    // 流已结束但仍有积压:先不 drained,以快进速率 STREAM_FINISH_RATE 排空。
    expect(result.current.drained).toBe(false)
    act(() => {
      vi.advanceTimersByTime(STREAM_TICK_MS)
    })
    expect(result.current.content).toBe('x'.repeat(3 + STREAM_FINISH_RATE))
    act(() => {
      vi.advanceTimersByTime(STREAM_TICK_MS * 20)
    })
    expect(result.current.drained).toBe(true)
    expect(result.current.content).toBe('x'.repeat(200))
    // 调用方落库后 reset:流式显示清空。
    act(() => {
      result.current.reset()
    })
    expect(result.current.content).toBeNull()
  })

  it('drains immediately on finish when everything is already shown', () => {
    const { result } = renderHook(() => useStreamingOutput())
    act(() => {
      result.current.push('abc')
      result.current.finish('abc')
    })
    // 无积压:finish 立即 drained。
    expect(result.current.drained).toBe(true)
    expect(result.current.content).toBe('abc')
  })

  it('resets immediately and discards buffered text', () => {
    const { result } = renderHook(() => useStreamingOutput())
    act(() => {
      result.current.push('a'.repeat(50))
    })
    expect(result.current.content).not.toBeNull()
    act(() => {
      result.current.reset()
    })
    expect(result.current.content).toBeNull()
    expect(result.current.drained).toBe(false)
    act(() => {
      vi.advanceTimersByTime(STREAM_TICK_MS * 10)
    })
    expect(result.current.content).toBeNull()
  })

  it('accepts pushes again after a reset', () => {
    const { result } = renderHook(() => useStreamingOutput())
    act(() => {
      result.current.push('old text')
      vi.advanceTimersByTime(STREAM_TICK_MS * 3)
      result.current.reset()
    })
    act(() => {
      result.current.push('new')
    })
    expect(result.current.content).toBe('new')
  })

  it('replace clears the display and retypes the new text', () => {
    const { result } = renderHook(() => useStreamingOutput())
    act(() => {
      result.current.push('old text')
    })
    expect(result.current.content).toBe('old ')
    act(() => {
      result.current.push('fresh', { replace: true })
    })
    expect(result.current.content).toBe('fres')
    act(() => {
      vi.advanceTimersByTime(STREAM_TICK_MS)
    })
    expect(result.current.content).toBe('fresh')
  })

  it('ignores pushes after finish while draining the final text', () => {
    const { result } = renderHook(() => useStreamingOutput())
    act(() => {
      result.current.push('ok')
      result.current.finish('done text')
    })
    // 'ok' 已全显,finish 的 9 字还有 7 字积压:排空期间忽略新 push。
    expect(result.current.drained).toBe(false)
    act(() => {
      result.current.push('late chunk')
      vi.advanceTimersByTime(STREAM_TICK_MS * 3)
    })
    expect(result.current.drained).toBe(true)
    expect(result.current.content).toBe('done text')
  })

  it('gentle speed reveals one char per tick (quarter of normal rate)', () => {
    const { result } = renderHook(() => useStreamingOutput('gentle'))
    act(() => {
      result.current.push('Hello, world!')
    })
    expect(result.current.content).toBe('H')
    act(() => {
      vi.advanceTimersByTime(STREAM_TICK_MS)
    })
    expect(result.current.content).toBe('He')
  })

  it('fast speed flushes everything on push without buffering', () => {
    const { result } = renderHook(() => useStreamingOutput('fast'))
    act(() => {
      result.current.push('Hello, world!')
    })
    expect(result.current.content).toBe('Hello, world!')
    act(() => {
      vi.advanceTimersByTime(STREAM_TICK_MS * 10)
    })
    expect(result.current.content).toBe('Hello, world!')
  })

  it('applies a new speed on the next tick when the prop changes', () => {
    const { result, rerender } = renderHook(({ speed }: { speed: StreamSpeed }) => useStreamingOutput(speed), {
      initialProps: { speed: 'normal' as StreamSpeed }
    })
    act(() => {
      result.current.push('Hello, world!')
    })
    expect(result.current.content).toBe('Hell')
    rerender({ speed: 'gentle' })
    act(() => {
      vi.advanceTimersByTime(STREAM_TICK_MS)
    })
    // 换档后下一 tick 按 gentle 的 1 字/tick:4 + 1 = 5;若仍按 normal 会到 8。
    expect(result.current.content).toBe('Hello')
  })

  it('flushes the remaining backlog on the next tick when switching to fast', () => {
    const { result, rerender } = renderHook(({ speed }: { speed: StreamSpeed }) => useStreamingOutput(speed), {
      initialProps: { speed: 'gentle' as StreamSpeed }
    })
    act(() => {
      result.current.push('Hello, world!')
    })
    expect(result.current.content).toBe('H')
    rerender({ speed: 'fast' })
    act(() => {
      vi.advanceTimersByTime(STREAM_TICK_MS)
    })
    expect(result.current.content).toBe('Hello, world!')
  })
})
