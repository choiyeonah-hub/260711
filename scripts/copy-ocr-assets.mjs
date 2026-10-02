// 브라우저 OCR(Tesseract) 파일을 public/ocr 로 복사한다 (외부 CDN 의존 제거).
// npm run dev / build 전에 자동 실행된다.
import { cpSync, mkdirSync } from 'node:fs'

const out = 'public/ocr'
mkdirSync(`${out}/lang`, { recursive: true })
cpSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`)
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  cpSync(`node_modules/tesseract.js-core/${f}`, `${out}/${f}`)
}
for (const l of ['kor', 'eng']) {
  cpSync(`node_modules/@tesseract.js-data/${l}/4.0.0_best_int/${l}.traineddata.gz`, `${out}/lang/${l}.traineddata.gz`)
}
console.log('OCR assets copied to', out)
