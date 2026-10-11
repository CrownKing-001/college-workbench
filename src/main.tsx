import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 桌面端不用 BrowserRouter：视图切换由工作台内部状态管理，
// file:// 协议下 history API 反而容易出问题。
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
