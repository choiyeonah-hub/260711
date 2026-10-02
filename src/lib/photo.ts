// 사진을 작게 압축해서 dataURL로 (저장 용량 절약)
export function compressImage(file: File, maxSize = 640, quality = 0.6): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없습니다')) }
    img.src = url
  })
}
