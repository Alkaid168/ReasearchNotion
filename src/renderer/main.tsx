import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/tokens.css'
import './styles/app.css'
import 'katex/dist/katex.min.css'
import { App } from './App'
import { RendererErrorBoundary } from './components/RendererErrorBoundary'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RendererErrorBoundary>
      <App />
    </RendererErrorBoundary>
  </React.StrictMode>
)
