import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'
import recognizeHandler from './api/recognize.ts'

// 로컬(dev/preview)에서도 Vercel과 같은 /api/recognize 를 쓰기 위한 미들웨어
function localApi(): Plugin {
  const mw: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url?.split('?')[0] === '/api/recognize') return void recognizeHandler(req, res)
    next()
  }
  return {
    name: 'local-api',
    configureServer: (s) => void s.middlewares.use(mw),
    configurePreviewServer: (s) => void s.middlewares.use(mw),
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // .env.local 의 ANTHROPIC_API_KEY 등을 서버 미들웨어에서 쓸 수 있게 (클라이언트 번들에는 들어가지 않음)
  Object.assign(process.env, loadEnv(mode, process.cwd(), ['ANTHROPIC_', 'RECOGNIZE_']))
  return { plugins: [react(), localApi()] }
})
