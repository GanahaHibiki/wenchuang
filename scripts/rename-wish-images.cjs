/**
 * 脚本：重命名心愿商品图片
 * 将现有的 UUID 命名的心愿商品图片重命名为 心愿_店铺名_商品名.扩展名
 *
 * 使用方法: node scripts/rename-wish-images.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const ORIGINAL_DIR = path.join(DATA_DIR, 'images', 'original');
const THUMBNAIL_DIR = path.join(DATA_DIR, 'images', 'thumbnails');

function sanitizeName(name) {
  return name.replace(/[/\\?%*:|"<>\s]/g, '_');
}

async function main() {
  // 读取数据库
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

  if (!db.wishItems || db.wishItems.length === 0) {
    console.log('没有心愿商品需要处理');
    return;
  }

  // 创建 shopId -> shopName 的映射
  const shopMap = new Map();
  for (const shop of db.shops) {
    shopMap.set(shop.id, shop.name);
  }

  let renamedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const wishItem of db.wishItems) {
    const shopName = shopMap.get(wishItem.shopId);
    if (!shopName) {
      console.log(`跳过: ${wishItem.productName} - 找不到店铺`);
      skippedCount++;
      continue;
    }

    const oldImagePath = wishItem.imagePath;
    const ext = path.extname(oldImagePath).toLowerCase() || '.png';

    // 新文件名: 心愿_店铺名_商品名.扩展名
    const newFilename = `心愿_${sanitizeName(shopName)}_${sanitizeName(wishItem.productName)}${ext}`;
    const newThumbnailFilename = newFilename.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '_thumb.jpg');

    // 如果已经是正确的命名，跳过
    if (oldImagePath === newFilename) {
      console.log(`跳过: ${wishItem.productName} - 已是正确命名`);
      skippedCount++;
      continue;
    }

    const oldOriginalPath = path.join(ORIGINAL_DIR, oldImagePath);
    const newOriginalPath = path.join(ORIGINAL_DIR, newFilename);
    const oldThumbnailPath = path.join(THUMBNAIL_DIR, wishItem.thumbnailPath);
    const newThumbnailPath = path.join(THUMBNAIL_DIR, newThumbnailFilename);

    try {
      // 检查源文件是否存在
      if (!fs.existsSync(oldOriginalPath)) {
        console.log(`错误: ${wishItem.productName} - 原图不存在: ${oldImagePath}`);
        errorCount++;
        continue;
      }

      // 重命名原图
      fs.renameSync(oldOriginalPath, newOriginalPath);
      console.log(`原图: ${oldImagePath} -> ${newFilename}`);

      // 重命名缩略图（如果存在）
      if (fs.existsSync(oldThumbnailPath)) {
        fs.renameSync(oldThumbnailPath, newThumbnailPath);
        console.log(`缩略图: ${wishItem.thumbnailPath} -> ${newThumbnailFilename}`);
      }

      // 更新数据库中的路径
      wishItem.imagePath = newFilename;
      wishItem.thumbnailPath = newThumbnailFilename;

      renamedCount++;
    } catch (err) {
      console.log(`错误: ${wishItem.productName} - ${err.message}`);
      errorCount++;
    }
  }

  // 保存数据库
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

  console.log('\n===== 完成 =====');
  console.log(`重命名: ${renamedCount} 个`);
  console.log(`跳过: ${skippedCount} 个`);
  console.log(`错误: ${errorCount} 个`);
}

main().catch(console.error);
