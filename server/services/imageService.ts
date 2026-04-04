import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { v4 as uuidv4 } from 'uuid'
import { DATA_DIR } from './database.js'

const ORIGINAL_DIR = path.join(DATA_DIR, 'images', 'original')
const THUMBNAIL_DIR = path.join(DATA_DIR, 'images', 'thumbnails')

const THUMBNAIL_WIDTH = 270
const THUMBNAIL_HEIGHT = 360

export async function saveImage(
  buffer: Buffer,
  originalName: string,
  shopName?: string,
  productName?: string
): Promise<{ imagePath: string; thumbnailPath: string }> {
  // Ensure directories exist
  await fs.mkdir(ORIGINAL_DIR, { recursive: true })
  await fs.mkdir(THUMBNAIL_DIR, { recursive: true })

  // Generate filename
  const ext = path.extname(originalName).toLowerCase() || '.jpg'
  let filename: string

  if (shopName && productName) {
    // Sanitize names: remove special characters and spaces
    const sanitizedShop = shopName.replace(/[/\\?%*:|"<>\s]/g, '_')
    const sanitizedProduct = productName.replace(/[/\\?%*:|"<>\s]/g, '_')
    filename = `${sanitizedShop}_${sanitizedProduct}${ext}`
  } else {
    // Fallback to UUID if names not provided
    const id = uuidv4()
    filename = `${id}${ext}`
  }

  const originalPath = path.join(ORIGINAL_DIR, filename)
  const thumbnailFilename = filename.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '_thumb.jpg')
  const thumbnailPath = path.join(THUMBNAIL_DIR, thumbnailFilename)

  // Save original
  await fs.writeFile(originalPath, buffer)

  // Generate thumbnail with sharp
  await sharp(buffer)
    .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
      fit: 'cover',
      position: 'center',
    })
    .jpeg({ quality: 85 })
    .toFile(thumbnailPath)

  return {
    imagePath: filename,
    thumbnailPath: thumbnailFilename,
  }
}

export function getOriginalPath(filename: string): string {
  return path.join(ORIGINAL_DIR, filename)
}

export function getThumbnailPath(filename: string): string {
  return path.join(THUMBNAIL_DIR, filename)
}
