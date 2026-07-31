import http from 'node:http'
import https from 'node:https'
import { pathToFileURL } from 'node:url'

const defaultPort = Number(process.env.DEEPSEEK_BRIDGE_PORT || 17778)
const defaultHost = process.env.DEEPSEEK_BRIDGE_HOST || '127.0.0.1'
const defaultUpstreamBaseUrl = process.env.DEEPSEEK_BRIDGE_UPSTREAM_BASE_URL || 'https://api.deepseek.com'

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
])

function filteredHeaders(headers, overrideHost) {
  const output = {}
  for (const [name, value] of Object.entries(headers)) {
    if (!value || hopByHopHeaders.has(name.toLowerCase())) continue
    output[name] = value
  }
  output.host = overrideHost
  return output
}

export function createDeepSeekBridgeServer(options = {}) {
  const upstreamBaseUrl = new URL(options.upstreamBaseUrl || defaultUpstreamBaseUrl)
  const log = options.log || console.log

  return http.createServer((clientRequest, clientResponse) => {
    if (clientRequest.url === '/health') {
      clientResponse.writeHead(200, { 'content-type': 'application/json' })
      clientResponse.end(JSON.stringify({ ok: true, upstream: upstreamBaseUrl.origin }))
      return
    }

    const upstreamUrl = new URL(clientRequest.url || '/', upstreamBaseUrl)
    log(`${clientRequest.method || 'GET'} ${clientRequest.url || '/'} -> ${upstreamUrl.href}`)
    const transport = upstreamUrl.protocol === 'http:' ? http : https
    const upstreamRequest = transport.request(
      upstreamUrl,
      {
        method: clientRequest.method,
        headers: filteredHeaders(clientRequest.headers, upstreamUrl.host)
      },
      (upstreamResponse) => {
        const responseHeaders = filteredHeaders(upstreamResponse.headers, undefined)
        delete responseHeaders.host
        clientResponse.writeHead(upstreamResponse.statusCode || 502, responseHeaders)
        upstreamResponse.pipe(clientResponse)
      }
    )

    upstreamRequest.on('error', (error) => {
      log(`DeepSeek bridge upstream error: ${error.message}`)
      if (!clientResponse.headersSent) {
        clientResponse.writeHead(502, { 'content-type': 'application/json' })
      }
      clientResponse.end(JSON.stringify({ error: 'deepseek_bridge_upstream_error', message: error.message }))
    })

    clientRequest.pipe(upstreamRequest)
  })
}

function isCliEntrypoint() {
  return import.meta.url === pathToFileURL(process.argv[1]).href
}

if (isCliEntrypoint()) {
  const server = createDeepSeekBridgeServer()
  server.listen(defaultPort, defaultHost, () => {
    console.log(`DeepSeek bridge listening at http://${defaultHost}:${defaultPort}`)
    console.log(`Forwarding to ${defaultUpstreamBaseUrl}`)
    console.log('Use Dify endpoint_url: http://host.docker.internal:17778')
  })

  process.on('SIGINT', () => server.close(() => process.exit(0)))
  process.on('SIGTERM', () => server.close(() => process.exit(0)))
}
