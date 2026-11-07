import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/tokens.css'
import './styles/global.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Не найден корневой элемент #root')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker только в проде: в dev он мешал бы горячей перезагрузке.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.warn('Не удалось зарегистрировать service worker', error)
    })
  })
}
