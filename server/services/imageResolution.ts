import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import type { Product } from '../../src/types/index.js'

interface Resolution { width: number; height: number }
export interface DisplayImage { productId: string; imagePath: string; thumbnailPath: string }
interface ImageDependencies {
  stat: (filename: string) => Promise<{ mtimeMs: number; size: number }>
  metadata: (filename: string) => Promise<{ width?: number; height?: number }>
}
const validResolution = (value: Resolution | undefined): value is Resolution =>
  !!value && Number.isFinite(value.width) && Number.isFinite(value.height) && value.width > 0 && value.height > 0

// No DB access or image writes. Dependency injection keeps dimensions/cache
// behavior testable without any real filesystem or sharp decoding.
export function createImageSelector(dependencies: ImageDependencies = {
  stat: filename => fs.stat(filename),
  metadata: filename => sharp(filename).metadata(),
}) {
  const cache = new Map<string, { signature: string; resolution: Promise<Resolution | undefined> }>()
  let activeDecodes = 0
  const waiting: (() => void)[] = []
  async function metadata(filename: string) {
    await new Promise<void>(resolve => {
      const start = () => { activeDecodes++; resolve() }
      if (activeDecodes < 8) start()
      else waiting.push(start)
    })
    try {
      return await dependencies.metadata(filename)
    } finally {
      activeDecodes--
      waiting.shift()?.()
    }
  }
  return function forSnapshot(originalDir: string) {
    const pending = new Map<string, Promise<Resolution | undefined>>()
    async function resolution(product: Product): Promise<Resolution | undefined> {
      if (typeof product.imagePath !== 'string' || !product.imagePath) return
      const filename = path.resolve(originalDir, product.imagePath)
      // Stored filenames must not escape the original image directory.
      if (!product.imagePath || !filename.startsWith(path.resolve(originalDir) + path.sep)) return
      let request = pending.get(filename)
      if (!request) {
        request = (async () => {
          try {
            const stat = await dependencies.stat(filename)
            const signature = `${stat.mtimeMs}:${stat.size}`
            // Stored dimensions cannot be trusted after a semantic filename
            // is overwritten. Validate the current file version via metadata.
            let entry = cache.get(filename)
            if (!entry || entry.signature !== signature) {
              const decoded = metadata(filename).then(value => {
                const size = { width: value.width || 0, height: value.height || 0 }
                return validResolution(size) ? size : undefined
              }).catch(() => undefined)
              entry = { signature, resolution: decoded }
              cache.set(filename, entry)
              if (cache.size > 512) cache.delete(cache.keys().next().value!)
            }
            return await entry.resolution
          } catch {
            cache.delete(filename)
            return undefined
          }
        })()
        pending.set(filename, request)
      }
      return request
    }
    return async function select(products: Product[]): Promise<DisplayImage | undefined> {
      const dimensions = await Promise.all(products.map(product => resolution(product)))
      let best: Product | undefined
      let area = 0
      for (let i = 0; i < products.length; i++) {
        const size = dimensions[i]
        const candidateArea = size ? size.width * size.height : 0
        if (candidateArea > area || (candidateArea > 0 && candidateArea === area && products[i].id.localeCompare(best!.id) < 0)) {
          best = products[i]
          area = candidateArea
        }
      }
      return best ? { productId: best.id, imagePath: best.imagePath, thumbnailPath: best.thumbnailPath } : undefined
    }
  }
}

export const selectImagesForSnapshot = createImageSelector()
