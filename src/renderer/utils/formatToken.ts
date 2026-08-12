/** 把 token 数格式化为紧凑可读的字符串：7.7k / 131k / 1.0M。
 *  1000 进位（与官方 token 计费口径一致），避免 1048576 显示成 "1049k"。 */
export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `${m >= 10 ? m.toFixed(0) : m.toFixed(1)}M`
  }
  if (n >= 1000) {
    const k = n / 1000
    return `${k >= 100 ? k.toFixed(0) : k.toFixed(1)}k`
  }
  return String(n)
}
