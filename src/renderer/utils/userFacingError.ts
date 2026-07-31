const fallbackMessage = '发送失败，请检查 Dify 配置或稍后重试。'

export function userFacingSendError(error: unknown): string {
  if (!(error instanceof Error)) return fallbackMessage

  if (/deepseek_bridge_upstream_error|Server Unavailable|SSLEOF|UNEXPECTED_EOF/i.test(error.message)) {
    return '大模型服务暂时不可用，已保留你的问题，请稍后重新发送。'
  }

  return (
    error.message
      .replace(/^Error invoking remote method '[^']+':\s*/i, '')
      .replace(/^Error:\s*/i, '')
      .trim() || fallbackMessage
  )
}
