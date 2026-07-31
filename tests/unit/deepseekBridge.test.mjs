import http from 'node:http'
import { once } from 'node:events'
import { describe, expect, it } from 'vitest'
import { createDeepSeekBridgeServer } from '../../scripts/deepseek-bridge.mjs'

function listen(server) {
  server.listen(0, '127.0.0.1')
  return once(server, 'listening').then(() => server.address().port)
}

describe('DeepSeek bridge', () => {
  it('proxies OpenAI-compatible requests without owning the API key', async () => {
    let captured = null
    const upstream = http.createServer((request, response) => {
      const chunks = []
      request.on('data', (chunk) => chunks.push(chunk))
      request.on('end', () => {
        captured = {
          method: request.method,
          url: request.url,
          authorization: request.headers.authorization,
          body: Buffer.concat(chunks).toString('utf8')
        }
        response.writeHead(200, {
          'content-type': 'application/json',
          'x-upstream-test': 'ok'
        })
        response.end(JSON.stringify({ id: 'chatcmpl-test', choices: [{ message: { content: 'ok' } }] }))
      })
    })
    const upstreamPort = await listen(upstream)
    const bridge = createDeepSeekBridgeServer({
      upstreamBaseUrl: `http://127.0.0.1:${upstreamPort}`,
      log: () => {}
    })
    const bridgePort = await listen(bridge)

    try {
      const response = await fetch(`http://127.0.0.1:${bridgePort}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer dify-owned-key',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ model: 'deepseek-v4-flash', messages: [{ role: 'user', content: 'hi' }] })
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('x-upstream-test')).toBe('ok')
      expect(await response.json()).toMatchObject({ id: 'chatcmpl-test' })
      expect(captured).toMatchObject({
        method: 'POST',
        url: '/chat/completions',
        authorization: 'Bearer dify-owned-key'
      })
      expect(captured.body).toContain('deepseek-v4-flash')
    } finally {
      bridge.close()
      upstream.close()
    }
  })
})
