# AI-Friendly Design Document - 文创商品订单管理系统

## Document Metadata
- **System Name**: 文创商品订单管理系统 (Wenchuang Order Management System)
- **Document Type**: Technical Design Specification
- **Version**: 1.14
- **Last Updated**: 2026-04-05

---

## System Overview

### Purpose
A **local desktop application** for Windows that manages merchandise orders, gifts, and promotional items from various shops, with analytics on gift-to-order ratios. All data stored locally without external database.

### Key Features
1. Order entry with multi-step workflow
2. Product catalog with image gallery
3. Order details with financial analytics
4. Product detail tracking across multiple contexts

### Technical Constraints
1. **Platform**: Windows local application (no server deployment)
2. **Storage**: JSON file-based storage (no database installation required)
3. **Images**: Local filesystem storage
4. **Image Upload**: Support clipboard paste (Ctrl+V) and file selection

---

## Technology Stack

### Recommended Architecture
```
┌─────────────────────────────────────────────────────────┐
│                    Electron App                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │              React Frontend (Renderer)            │ │
│  │  - React 18 + TypeScript                         │ │
│  │  - React Router (SPA navigation)                 │ │
│  │  - TailwindCSS (styling)                         │ │
│  └───────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────┐ │
│  │              Node.js Backend (Main Process)       │ │
│  │  - File system operations (fs)                   │ │
│  │  - Image processing (sharp)                      │ │
│  │  - JSON data management                          │ │
│  └───────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────┐ │
│  │              Local Storage                        │ │
│  │  - ./data/db.json (all data)                     │ │
│  │  - ./data/images/original/ (full images)         │ │
│  │  - ./data/images/thumbnails/ (640×480 thumbs)    │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Alternative: Pure Web App (Simpler)
```
┌─────────────────────────────────────────────────────────┐
│           Browser-based SPA (localhost)                 │
│  ┌───────────────────────────────────────────────────┐ │
│  │              React Frontend                       │ │
│  │  - Vite + React + TypeScript                     │ │
│  │  - LocalStorage / IndexedDB for data             │ │
│  │  - File System Access API for images             │ │
│  └───────────────────────────────────────────────────┘ │
│  Run: npm run dev → http://localhost:5173              │
└─────────────────────────────────────────────────────────┘
```

### Dependencies
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.x",
    "uuid": "^9.x"
  },
  "devDependencies": {
    "vite": "^5.x",
    "typescript": "^5.x",
    "@types/react": "^18.x",
    "tailwindcss": "^3.x"
  }
}
```

---

## Data Model

### Core Entities

#### 1. Shop (店铺)
```typescript
interface Shop {
  id: string;
  name: string;           // 店铺名称
  createdAt: Date;
}
```

#### 2. Product (商品)
```typescript
interface Product {
  id: string;
  name: string;           // 商品名
  imagePath: string;      // 本地图片路径 (相对路径: images/original/{id}.{ext})
  imageResolution: {      // 原始图片分辨率
    width: number;
    height: number;
  };
  thumbnailPath: string;  // 缩略图路径 (images/thumbnails/{id}_thumb.{ext})
}
```

#### 3. Specification (规格)
```typescript
type SpecificationType = 
  | "试吃set"
  | "小食量set"
  | "大食量set"
  | "折页"
  | "异形折页"
  | "卡背"
  | "卡头"          // 支持多条追加
  | "封口贴"        // 支持多条追加
  | "长贴"          // 支持多条追加
  | "贴纸包"
  | "封箱贴"
  | "售后卡"
  | "豆丁贴"
  | "gift贴"
  | "磨砂盒"
  | "其他衍生";

interface Specification {
  type: SpecificationType;
  customType?: string;       // Custom type name when type is '其他衍生'
  sequenceNumber?: number;   // For 卡头/封口贴/长贴 multi-entry (1, 2, 3...)
  quantity: number;          // 数量
  purchasePrice?: number;    // 购入价 (only for purchased items)
  originalPrice: number;     // 原价
}
```

#### 4. Order Item (订单商品)
```typescript
type ItemCategory = "purchased" | "gift" | "smallGift";

type GiftType = "满赠礼" | "宣传礼" | "手速礼" | "高消礼";

interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  category: ItemCategory;
  giftType?: GiftType;       // Only for gift category
  specifications: Specification[];
  createdAt: Date;
}
```

#### 5. Order (订单)
```typescript
interface Order {
  id: string;
  sequenceNumber: number;    // 录入顺序 (auto-reordered on deletion)
  shopId: string;
  items: OrderItem[];
  
  // Calculated fields
  totalAmount: number;       // 订单金额
  smallGiftTotal: number;    // 小礼物总价
  giftRatio: number;         // 小礼物占比 (保留1位小数)
  
  createdAt: Date;
}
```

---

## Calculation Logic

### 1. Order Total Amount (订单金额)
```typescript
function calculateOrderTotal(order: Order): number {
  const purchasedItems = order.items.filter(item => item.category === "purchased");
  
  return purchasedItems.reduce((sum, item) => {
    const itemTotal = item.specifications.reduce((specSum, spec) => {
      return specSum + (spec.quantity * (spec.purchasePrice || 0));
    }, 0);
    return sum + itemTotal;
  }, 0);
}
```

### 2. Small Gift Total (小礼物总价)
```typescript
function calculateSmallGiftTotal(order: Order): number {
  const smallGifts = order.items.filter(item => item.category === "smallGift");
  
  return smallGifts.reduce((sum, item) => {
    const itemTotal = item.specifications.reduce((specSum, spec) => {
      return specSum + (spec.quantity * spec.originalPrice);
    }, 0);
    return sum + itemTotal;
  }, 0);
}
```

### 3. Gift Ratio (小礼物占比)
```typescript
function calculateGiftRatio(order: Order): number {
  const smallGiftTotal = calculateSmallGiftTotal(order);
  const orderTotal = calculateOrderTotal(order);
  
  if (orderTotal === 0) return 0;
  
  const ratio = (smallGiftTotal / orderTotal) * 100;
  return Math.round(ratio * 10) / 10; // 保留1位小数
}
```

---

## Page Specifications

### Page 1: Home Page (主页)

#### Layout Structure
```
┌─────────────┬────────────────────────────────────────────┐
│             │  [Search Bar]                              │
│  Menu       │  ┌──────────────────────────────────────┐  │
│  - 订单录入  │  │ Search Type: [商品名 | 店铺名]       │  │
│  - 订单详情  │  │ Keyword: [________] [Search Button]  │  │
│  - 已购店铺  │  └──────────────────────────────────────┘  │
│             │                                            │
│             │  [Product Gallery]                         │
│             │  ┌─────────────────────────────────────┐   │
│             │  │ 总 xx 件商品 / 搜索到 xx 个商品      │   │
│             │  └─────────────────────────────────────┘   │
│             │  [Product Grid: 5 cols × 10 rows = 50]    │
│             │                                            │
│             │  [Pagination]                              │
│             │  第 x 页，共 x 页  [<上一页] [下一页>]     │
└─────────────┴────────────────────────────────────────────┘
```

#### Components

**1.1 Navigation Menu**
- Position: Left sidebar
- Items:
  - 订单录入 → Navigate to Order Entry Page
  - 订单详情 → Navigate to Order List Page
  - 已购店铺 → Navigate to Shop List Page

**1.2 Search Bar**
- Search Types:
  - 商品名 (Product Name)
  - 店铺名 (Shop Name)
- Behavior:
  - On search: Filter products and update gallery
  - Display: "搜索到 xx 个商品"

**1.3 Product Gallery**
- Grid Layout: 5 columns × 10 rows = 50 items per page
- Each Product Card:
  - Container: Responsive width with aspect-[4/3] (4:3 aspect ratio)
  - Image: Original image with object-cover (center crop to fill container)
  - Responsive behavior: Container width adjusts to page width, maintaining 4:3 ratio
  - Image scaling: Fills container completely via center crop at any size
  - Note: Uses original images, not thumbnails
  - Product Name (clickable → Product Detail Page)
- Default: Show all purchased products (deduplicated by name, keep most recent)
- Display: "总 xx 件商品"

**1.4 Image Viewer**
- Trigger: Click on thumbnail
- Features:
  - Display original resolution
  - Mouse wheel zoom: 0.5x to 5x scale
  - Drag to pan when zoomed in (cursor changes to grab/grabbing)
  - Click outside image or press Esc to close
  - No visible buttons or controls
  - Instructions shown at bottom: "滚轮缩放 | 拖动平移 | 点击外部或按 Esc 关闭"

**1.5 Pagination**
- Display: "第 x 页，共 x 页"
- Controls: 上一页, 下一页

---

### Page 2: Order Entry (订单录入)

#### Multi-Step Workflow

**Step 1: Shop Information**
```
┌─────────────────────────────────────┐
│ Step 1: 店铺信息                     │
├─────────────────────────────────────┤
│ 店铺名称: [_________________]        │
│                                     │
│           [确认并进入下一步]          │
└─────────────────────────────────────┘
```

**Step 2: Purchased Items (已购商品)**
```
┌─────────────────────────────────────────────────┐
│ Step 2: 已购商品录入                             │
├─────────────────────────────────────────────────┤
│ 商品名: [_________________]                      │
│ 上传图片: [Choose File] [Preview]                │
│ 💡 点击图片区域后可直接 Ctrl+V 粘贴              │
│                                                 │
│ 规格选择: (下拉框或列表，可添加多条)             │
│ ☐ 试吃set      ☐ 小食量set    ☐ 大食量set        │
│ ☐ 折页         ☐ 异形折页     ☐ 卡背             │
│ ☐ 卡头         ☐ 封口贴       ☐ 长贴             │
│ ☐ 贴纸包       ☐ 封箱贴       ☐ 售后卡           │
│ ☐ 豆丁贴       ☐ gift贴       ☐ 磨砂盒           │
│ ☐ 其他衍生 [自定义类别名: _________]             │
│                                                 │
│ For each selected specification:                │
│ - 类型: [下拉选择]                               │
│ - 数量: [____]                                   │
│ - 购入价: [____]                                 │
│ - 原价: [____]                                   │
│                                                 │
│ For 卡头/封口贴/长贴: [+ 添加更多]               │
│                                                 │
│ [继续添加新商品]  [进入下一步]                    │
└─────────────────────────────────────────────────┘
```

**Step 3: Gifts (礼品)**
```
┌─────────────────────────────────────────────────┐
│ Step 3: 礼品录入                                 │
├─────────────────────────────────────────────────┤
│ 礼品类型: ○ 满赠礼 ○ 宣传礼 ○ 手速礼 ○ 高消礼   │
│                                                 │
│ 商品名: [_________________]                      │
│ 上传图片: [Choose File] [Preview]                │
│                                                 │
│ [Same specification checkboxes as Step 2]       │
│                                                 │
│ For each selected specification:                │
│ - 数量: [____]                                   │
│ - 原价: [____]                                   │
│                                                 │
│ For 卡头/封口贴/长贴: [+ 添加更多]               │
│                                                 │
│ [继续添加新礼品]  [进入下一步]                    │
└─────────────────────────────────────────────────┘
```

**Step 4: Small Gifts (小礼物)**
```
┌─────────────────────────────────────────────────┐
│ Step 4: 小礼物录入                               │
├─────────────────────────────────────────────────┤
│ 商品名: [_________________]                      │
│ 上传图片: [Choose File] [Preview]                │
│                                                 │
│ [Same specification checkboxes as Step 2]       │
│                                                 │
│ For each selected specification:                │
│ - 数量: [____]                                   │
│ - 原价: [____]                                   │
│                                                 │
│ For 卡头/封口贴/长贴: [+ 添加更多]               │
│                                                 │
│ [继续添加新小礼物]  [录入完成]                    │
└─────────────────────────────────────────────────┘
```

#### Validation Rules
- Shop name: Required, non-empty
- Product name: Required for each item
- Image: Required for each item
- Specifications: At least one must be selected
- Quantity: Required, positive integer
- Purchase Price (Step 2): Required, positive number
- Original Price: Required, positive number

---

### Page 3: Order List (订单详情)

#### Table Layout
```
┌─────┬──────────┬──────────┬────────────┬────────────┐
│ 序号 │ 店铺名称  │ 订单金额  │ 小礼物总价  │ 小礼物占比  │
├─────┼──────────┼──────────┼────────────┼────────────┤
│  1  │ Shop A   │ ¥1000.00 │ ¥150.00    │ 15.0%      │  ← Entire row clickable
│  2  │ Shop B   │ ¥800.00  │ ¥80.00     │ 10.0%      │  ← Entire row clickable
└─────┴──────────┴──────────┴────────────┴────────────┘

Sort by: [订单金额 ↕] [小礼物占比 ↕]
```

#### Columns
1. **序号**: Sequence number (auto-reordered on deletion), entire row clickable → Order Detail Page
2. **店铺名称**: Shop name (editable in order detail page)
3. **订单金额**: Sum of (quantity × purchasePrice) for all purchased items
4. **小礼物总价**: Sum of (quantity × originalPrice) for all small gifts
5. **小礼物占比**: (小礼物总价 ÷ 订单金额) × 100%, rounded to 1 decimal

#### Sorting
- **订单金额**: Ascending/Descending
- **小礼物占比**: Ascending/Descending

---

### Page 4: Order Detail (订单详情页)

#### Layout
```
┌─────────────────────────────────────────────────────────┐
│ 订单详情 #1 - Shop Name [编辑]                          │
├─────────────────────────────────────────────────────────┤
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ 订单金额: ¥xxx.xx                                       │
│ 小礼物总价: ¥xxx.xx                                     │
│ 小礼物占比: xx.x%                                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                         │
│ ━━━ 已购商品 ━━━                          [编辑]        │
│                                                         │
│ ┌─────┬─────┬─────┬─────┬─────┐  (Responsive Grid)    │
│ │[IMG]│[IMG]│[IMG]│[IMG]│[IMG]│  5 cols on xl screens │
│ │Name │Name │Name │Name │Name │  4 cols on lg         │
│ │Spec │Spec │Spec │Spec │Spec │  3 cols on md         │
│ └─────┴─────┴─────┴─────┴─────┘  2 cols on sm         │
│                                                         │
│ ━━━ 礼品 ━━━                              [编辑]        │
│                                                         │
│ [满赠礼]                                                │
│ ┌─────┬─────┬─────┬─────┬─────┐                        │
│ │[IMG]│[IMG]│[IMG]│[IMG]│[IMG]│                        │
│ │Name │Name │Name │Name │Name │                        │
│ │Spec │Spec │Spec │Spec │Spec │                        │
│ └─────┴─────┴─────┴─────┴─────┘                        │
│                                                         │
│ ━━━ 小礼物 ━━━                            [编辑]        │
│                                                         │
│ ┌─────┬─────┬─────┬─────┬─────┐                        │
│ │[IMG]│[IMG]│[IMG]│[IMG]│[IMG]│                        │
│ │Name │Name │Name │Name │Name │                        │
│ │Spec │Spec │Spec │Spec │Spec │                        │
│ └─────┴─────┴─────┴─────┴─────┘                        │
│                                                         │
│ 💡 编辑提示: 点击图片上传区域使其获得焦点后可 Ctrl+V   │
└─────────────────────────────────────────────────────────┘
```

#### Sections
1. **Summary Section** (Top, after header)
   - Display: 订单金额, 小礼物总价, 小礼物占比

2. **已购商品** (Purchased Items)
   - Display: Responsive grid layout (2/3/4/5 columns based on screen width)
   - Each item card: Image (4:3 aspect ratio) + Name + Specifications with 购入价
   - Sequence numbers only shown when multiple entries of same type exist in this order
   - [编辑] button to modify

3. **礼品** (Gifts)
   - Grouped by gift type (满赠礼, 宣传礼, 手速礼, 高消礼)
   - Display: Responsive grid layout per group
   - Each item card: Image + Name + Specifications with 原价
   - Sequence numbers only shown when multiple entries of same type exist in this order
   - [编辑] button to modify

4. **小礼物** (Small Gifts)
   - Display: Responsive grid layout
   - Each item card: Image + Name + Specifications with 原价
   - Sequence numbers only shown when multiple entries of same type exist in this order
   - [编辑] button to modify

#### Responsive Grid Breakpoints
- Small screens (sm): 2 columns (`grid-cols-2`)
- Medium screens (md): 3 columns (`md:grid-cols-3`)
- Large screens (lg): 4 columns (`lg:grid-cols-4`)
- Extra large screens (xl): 5 columns (`xl:grid-cols-5`)

#### Interactions
- Click product name → Navigate to Product Detail Page
- Click [编辑] next to shop name → Enter edit mode with input field and Save/Cancel buttons
- Click [编辑] on item category → Enter edit mode for that category
  - In edit mode, click image upload area to focus it, then Ctrl+V to paste image
- Shop name changes are saved via PUT /api/orders/:id with shopName parameter

---

### Page 5: Product Detail (商品详情页)

#### Layout
```
┌─────────────────────────────────────────────────────────────────────┐
│ 商品详情 - Product Name                              [返回首页]      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ┌──────────────┬────────────────────────────────────────────────┐  │
│ │              │  ━━━ 已购商品记录 ━━━                          │  │
│ │              │                                                │  │
│ │              │  订单1 - Shop A (点击跳转)                     │  │
│ │              │  - 规格1: 数量 x 个, 购入价¥xx.xx, 原价¥xx.xx  │  │
│ │  [Product    │  - 规格2: 数量 x 个, 购入价¥xx.xx, 原价¥xx.xx  │  │
│ │   Image]     │                                                │  │
│ │              │  订单2 - Shop B (点击跳转)                     │  │
│ │  640px       │  - 规格1: 数量 x 个, 购入价¥xx.xx, 原价¥xx.xx  │  │
│ │  fixed       │                                                │  │
│ │              │  ━━━ 礼品记录 ━━━                              │  │
│ │  点击查看    │                                                │  │
│ │  大图        │  订单3 - Shop C [满赠礼] (点击跳转)            │  │
│ │              │  - 规格1: 数量 x 个, 原价¥xx.xx                │  │
│ │              │                                                │  │
│ │              │  ━━━ 小礼物记录 ━━━                            │  │
│ │              │                                                │  │
│ │              │  订单1 - Shop A (点击跳转)                     │  │
│ │              │  - 规格1: 数量 x 个, 原价¥xx.xx                │  │
│ │              │                                                │  │
│ └──────────────┴────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### Content Rules
1. **Layout**: Left-right split - Image (640px fixed) + Records (flexible width)
2. **Display Original Image**: Full resolution, not thumbnail; click to open viewer with zoom/pan
3. **Group by Category**: 已购商品, 礼品, 小礼物 (all in right column)
4. **Multiple Entries**: Same product can appear multiple times in same category
5. **Show Non-Zero Specs Only**: Only display specifications with quantity > 0
6. **Sequence Number Display**: Only show sequence numbers (e.g., "封口贴1", "封口贴2") when multiple entries of the same spec type exist in that order
7. **Price Display**:
   - 已购商品: Show both 购入价 and 原价
   - 礼品/小礼物: Show only 原价
8. **Order Links**: Each entry is clickable, navigates to corresponding order detail page

---

## UI/UX Specifications

### Image Handling

#### 1. Upload Methods (支持两种上传方式)

**Method A: File Selection (文件选择)**
```typescript
// React component for file upload
function ImageUploader({ onImageSelect }: Props) {
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isValidImageType(file)) {
      onImageSelect(file);
    }
  };

  return (
    <input 
      type="file" 
      accept="image/jpeg,image/png,image/webp"
      onChange={handleFileSelect}
    />
  );
}
```

**Method B: Clipboard Paste (剪贴板粘贴 - Ctrl+V)**

**Important**: Clipboard paste is focus-based. When multiple image upload areas exist on a page:
1. Click on the specific upload area to give it focus (blue ring indicator appears)
2. Then press Ctrl+V to paste the image to that specific uploader
3. This prevents accidental pasting to the wrong image field

```typescript
// React hook for clipboard paste
function useClipboardPaste(onImagePaste: (file: File) => void) {
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            onImagePaste(file);
            e.preventDefault();
          }
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [onImagePaste]);
}

// Usage in component
function ImageUploadArea({ onImageSelect, enableClipboard = false }: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Handle clipboard paste - only when focused
  useClipboardPaste((file) => {
    if (enableClipboard && isFocused) {
      handleImage(file);
    }
  });

  const handleImage = (file: File) => {
    if (!isValidImageType(file)) {
      alert('仅支持 JPG、PNG、WebP 格式');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('文件大小不能超过 10MB');
      return;
    }
    
    // Show preview
    const url = URL.createObjectURL(file);
    setPreview(url);
    onImageSelect(file);
  };

  return (
    <div 
      className={`upload-area ${isDragOver ? 'drag-over' : ''} ${isFocused ? 'focused' : ''}`}
      tabIndex={enableClipboard ? 0 : -1}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleImage(file);
      }}
    >
      {preview ? (
        <img src={preview} alt="Preview" className="preview-image" />
      ) : (
        <div className="upload-placeholder">
          <p>点击选择图片 或 拖拽图片到此处</p>
          {enableClipboard && (
            <p className="hint">点击此区域后可直接 Ctrl+V 粘贴图片</p>
          )}
        </div>
      )}
      <input 
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImage(file);
        }}
        className="file-input"
      />
    </div>
  );
}
```

**Upload Area UI Layout**
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│         ┌─────────────────────────────┐            │
│         │                             │            │
│         │      [Preview Image]        │            │
│         │         or                  │            │
│         │   📷 点击选择图片            │            │
│         │      或 拖拽到此处           │            │
│         │                             │            │
│         │ 💡 点击此区域后可 Ctrl+V     │            │
│         │    (需启用 enableClipboard)  │            │
│         │                             │            │
│         └─────────────────────────────┘            │
│         Blue ring appears when focused              │
│                                                     │
│   支持格式: JPG, PNG, WebP | 最大 10MB              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### 2. Image Processing (本地图片处理)
```typescript
// Image processing service
class ImageService {
  private originalDir = './data/images/original';
  private thumbnailDir = './data/images/thumbnails';

  async saveImage(file: File, productId: string, shopName?: string, productName?: string): Promise<{
    imagePath: string;
    thumbnailPath: string;
    resolution: { width: number; height: number };
  }> {
    // Get file extension
    const ext = this.getExtension(file.type);
    
    // Generate filename with shop and product name if provided
    let filename: string;
    if (shopName && productName) {
      const sanitizedShop = shopName.replace(/[/\\?%*:|"<>\s]/g, '_');
      const sanitizedProduct = productName.replace(/[/\\?%*:|"<>\s]/g, '_');
      filename = `${sanitizedShop}_${sanitizedProduct}.${ext}`;
    } else {
      filename = `${productId}.${ext}`;
    }
    
    // Save original
    const originalPath = `${this.originalDir}/${filename}`;
    const buffer = await file.arrayBuffer();
    await fs.writeFile(originalPath, Buffer.from(buffer));
    
    // Get dimensions
    const dimensions = await this.getImageDimensions(originalPath);
    
    // Generate thumbnail (640×480)
    const thumbnailPath = `${this.thumbnailDir}/${filename.replace(/\.\w+$/, '_thumb.jpg')}`;
    await this.createThumbnail(originalPath, thumbnailPath, 640, 480);
    
    return {
      imagePath: `images/original/${filename}`,
      thumbnailPath: `images/thumbnails/${filename.replace(/\.\w+$/, '_thumb.jpg')}`,
      resolution: dimensions
    };
  }

  private async createThumbnail(
    sourcePath: string,
    destPath: string,
    width: number,
    height: number
  ): Promise<void> {
    // Using canvas for browser, or sharp for Node.js/Electron
    const img = await loadImage(sourcePath);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d')!;
    
    // Calculate crop to maintain aspect ratio
    const srcRatio = img.width / img.height;
    const dstRatio = width / height;
    
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    
    if (srcRatio > dstRatio) {
      sw = img.height * dstRatio;
      sx = (img.width - sw) / 2;
    } else {
      sh = img.width / dstRatio;
      sy = (img.height - sh) / 2;
    }
    
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
    
    // Convert to blob and save
    const blob = await new Promise<Blob>(resolve => 
      canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.85)
    );
    await this.saveBlob(blob, destPath);
  }

  private getExtension(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp'
    };
    return map[mimeType] || 'jpg';
  }
}
```

#### 3. Display
- Product Gallery: Original images with object-cover (responsive 4:3 aspect ratio, center crop fill)
- Order Detail Thumbnails: 640×480 with object-cover
- Original: Full resolution in lightbox/detail view

#### 4. Lightbox Features
- Click to view original image
- Mouse wheel zoom: 0.5x to 5x scale range
- Drag to pan when zoomed (grab cursor)
- Close: Click outside image or press Esc key
- No visible UI buttons or controls

### Form Validation
- Real-time validation on blur
- Clear error messages
- Disable submit until valid
- Highlight invalid fields in red

### Responsive Behavior
- Desktop: Full layout as specified
- Tablet: 3-4 columns for product grid
- Mobile: 2 columns, stacked forms

---

## Search & Filter Logic

### Search Types

#### 1. By Product Name (商品名)
```typescript
function searchByProductName(keyword: string, products: Product[]): Product[] {
  const lowerKeyword = keyword.toLowerCase().trim();
  return products.filter(product => 
    product.name.toLowerCase().includes(lowerKeyword)
  );
}
```

#### 2. By Shop Name (店铺名)
```typescript
function searchByShopName(keyword: string, orders: Order[], shops: Shop[], products: Product[]): Product[] {
  const lowerKeyword = keyword.toLowerCase().trim();
  
  // Find matching shops
  const matchingShops = shops.filter(shop => 
    shop.name.toLowerCase().includes(lowerKeyword)
  );
  
  // Get all products from orders of matching shops
  const shopIds = new Set(matchingShops.map(s => s.id));
  const matchingOrders = orders.filter(order => shopIds.has(order.shopId));
  
  // Extract unique products from purchased items
  const productIds = new Set<string>();
  matchingOrders.forEach(order => {
    order.items
      .filter(item => item.category === "purchased")
      .forEach(item => productIds.add(item.productId));
  });
  
  const matchingProducts = Array.from(productIds)
    .map(id => products.find(p => p.id === id))
    .filter(p => p !== undefined);
  
  // Deduplicate by product name, keep most recent
  const productsByName = new Map<string, Product>();
  for (const product of matchingProducts) {
    const existing = productsByName.get(product.name);
    if (!existing || product.createdAt > existing.createdAt) {
      productsByName.set(product.name, product);
    }
  }
  
  return Array.from(productsByName.values());
}
```

---

## Local Storage Schema (JSON File-Based)

### Directory Structure
```
./data/
├── db.json                          # All application data
├── images/
│   ├── original/                    # Original uploaded images
│   │   ├── {product-id}.jpg
│   │   ├── {product-id}.png
│   │   └── ...
│   └── thumbnails/                  # Auto-generated 480×640 thumbnails
│       ├── {product-id}_thumb.jpg
│       └── ...
└── backups/                         # Auto-backup on each save
    ├── db_2026-04-04_120000.json
    └── ...
```

### db.json Schema
```typescript
interface Database {
  version: string;           // Schema version for migrations
  lastModified: string;      // ISO timestamp
  
  shops: Shop[];
  products: Product[];
  orders: Order[];
  
  // Sequence counter for order numbering
  nextOrderSequence: number;
}
```

### Example db.json
```json
{
  "version": "1.0",
  "lastModified": "2026-04-04T12:00:00.000Z",
  "nextOrderSequence": 3,
  "shops": [
    {
      "id": "shop-uuid-1",
      "name": "萌物小店",
      "createdAt": "2026-04-01T10:00:00.000Z"
    }
  ],
  "products": [
    {
      "id": "prod-uuid-1",
      "name": "可爱猫咪贴纸",
      "imagePath": "images/original/prod-uuid-1.jpg",
      "imageResolution": { "width": 1920, "height": 2560 },
      "thumbnailPath": "images/thumbnails/prod-uuid-1_thumb.jpg"
    }
  ],
  "orders": [
    {
      "id": "order-uuid-1",
      "sequenceNumber": 1,
      "shopId": "shop-uuid-1",
      "items": [...],
      "totalAmount": 150.00,
      "smallGiftTotal": 20.00,
      "giftRatio": 13.3,
      "createdAt": "2026-04-01T10:30:00.000Z"
    }
  ]
}
```

### Data Operations
```typescript
// Data service for JSON file operations
class DataService {
  private dbPath = './data/db.json';
  private data: Database;

  // Load database from file
  async load(): Promise<Database> {
    const content = await fs.readFile(this.dbPath, 'utf-8');
    this.data = JSON.parse(content);
    return this.data;
  }

  // Save database to file (with auto-backup)
  async save(): Promise<void> {
    this.data.lastModified = new Date().toISOString();
    
    // Create backup before saving
    await this.createBackup();
    
    await fs.writeFile(
      this.dbPath,
      JSON.stringify(this.data, null, 2),
      'utf-8'
    );
  }

  // Create timestamped backup
  private async createBackup(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `./data/backups/db_${timestamp}.json`;
    await fs.copyFile(this.dbPath, backupPath);
    
    // Keep only last 10 backups
    await this.cleanOldBackups(10);
  }
}
```

---

## API Endpoints (Internal IPC / Function Calls)

> Note: Since this is a local application, these are internal function calls rather than HTTP endpoints.
> For Electron: Use IPC channels. For pure web: Direct function calls.

### Data Access Layer
```typescript
// shops.ts
export const shopService = {
  getAll: (): Shop[] => db.shops,
  getById: (id: string): Shop | undefined => db.shops.find(s => s.id === id),
  create: (name: string): Shop => { /* ... */ },
};

// products.ts
export const productService = {
  getAll: (): Product[] => db.products,
  getById: (id: string): Product | undefined => db.products.find(p => p.id === id),
  getPurchased: (): Product[] => { /* get products that appear in purchased items */ },
  search: (type: 'productName' | 'shopName', keyword: string): Product[] => { /* ... */ },
  create: (name: string, imageFile: File): Promise<Product> => { /* ... */ },
};

// orders.ts
export const orderService = {
  getAll: (sortBy?: 'totalAmount' | 'giftRatio', order?: 'asc' | 'desc'): Order[] => { /* ... */ },
  getById: (id: string): Order | undefined => db.orders.find(o => o.id === id),
  create: (data: CreateOrderInput): Order => { /* ... */ },
  update: (id: string, data: UpdateOrderInput): Order => { /* ... */ },
};
```

---

## Business Rules Summary

### Specification Multi-Entry Rules
- **Types supporting multiple entries**: 卡头, 封口贴, 长贴
- **Naming convention**: Display as "封口贴1", "封口贴2", "封口贴3"... only when multiple entries exist
- **Storage**: Use `sequenceNumber` field (1, 2, 3...)
- **Display Logic**: Check count of each spec type in order; only show sequence number if count > 1

### Custom Specification Types
- **其他衍生** type supports custom names via `customType` field
- When displaying: show `customType` value if present, otherwise show type name

### Price Rules
- **购入价 (Purchase Price)**: Only for "已购商品" category, required
- **原价 (Original Price)**: Required for all categories

### Display Rules
- **Only show non-zero specifications**: Filter out specifications with quantity = 0
- **Decimal precision**: All monetary values to 2 decimal places, ratios to 1 decimal place
- **Product deduplication**: In product galleries, same product name only shows once (keep most recent)
- **Sequence number visibility**: Only display sequence numbers when multiple entries of same spec type exist in that order

### Order Sequencing
- **Sequence number**: Auto-increment based on order creation time
- **Auto-reordering**: When an order is deleted, all remaining orders are reordered sequentially (1, 2, 3...)
- **No gaps**: Ensures sequence numbers are always consecutive

---

## Edge Cases & Error Handling

### Image Upload
- **Error**: File too large → "文件大小不能超过 10MB"
- **Error**: Invalid format → "仅支持 JPG、PNG、WebP 格式"
- **Error**: Upload failed → "上传失败,请重试"

### Form Validation
- **Error**: Empty shop name → "请输入店铺名称"
- **Error**: No specification selected → "请至少选择一个规格"
- **Error**: Invalid quantity → "数量必须为正整数"
- **Error**: Invalid price → "价格必须为正数"

### Search
- **Empty keyword**: Show all products
- **No results**: Display "未找到匹配的商品"

### Pagination
- **First page**: Disable "上一页" button
- **Last page**: Disable "下一页" button
- **Empty results**: Show "暂无商品"

### Division by Zero
- **Gift ratio calculation**: If orderTotal = 0, display "-" instead of ratio

---

## Performance Considerations

### Local Application Optimizations
- Load db.json once at startup, keep in memory
- Lazy load images as user scrolls (intersection observer)
- Debounce search input (300ms delay)
- Auto-save with debounce (save 1 second after last change)
- Keep backup cleanup async (don't block UI)

---

## Windows Deployment

### Option 1: Electron (Recommended for full native experience)
```bash
# Build commands
npm run build          # Build React app
npm run electron:build # Package as Windows .exe

# Output: dist/WenChuang-Setup-1.0.0.exe
```

### Option 2: Local Web Server (Simpler)
```bash
# Run locally
npm run dev            # Start dev server at localhost:5173

# Build static files
npm run build          # Output to dist/

# Run with simple server
npx serve dist         # Serve static files
```

### Startup Script (run.bat)
```batch
@echo off
cd /d "%~dp0"
start "" http://localhost:5173
npm run dev
```

---

## Project Structure
```
WenChuang/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── src/
│   ├── main.tsx                    # Entry point
│   ├── App.tsx                     # Root component with router
│   ├── types/
│   │   └── index.ts                # TypeScript interfaces
│   ├── services/
│   │   ├── database.ts             # JSON file operations
│   │   ├── imageService.ts         # Image upload & thumbnail
│   │   └── calculationService.ts   # Order calculations
│   ├── hooks/
│   │   ├── useDatabase.ts          # Data loading hook
│   │   └── useClipboardPaste.ts    # Clipboard paste hook
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── Sidebar.tsx         # Navigation menu
│   │   │   └── MainLayout.tsx
│   │   ├── common/
│   │   │   ├── ImageUploader.tsx   # File + clipboard upload
│   │   │   ├── ImageViewer.tsx     # Lightbox with zoom/pan
│   │   │   ├── Pagination.tsx
│   │   │   └── SearchBar.tsx
│   │   ├── product/
│   │   │   ├── ProductCard.tsx
│   │   │   ├── ProductGrid.tsx
│   │   │   └── ProductDetail.tsx
│   │   ├── order/
│   │   │   ├── OrderEntry/
│   │   │   │   ├── StepShop.tsx
│   │   │   │   ├── StepPurchased.tsx
│   │   │   │   ├── StepGifts.tsx
│   │   │   │   ├── StepSmallGifts.tsx
│   │   │   │   └── SpecificationForm.tsx
│   │   │   ├── OrderList.tsx
│   │   │   └── OrderDetail.tsx
│   │   └── shop/
│   │       └── ShopList.tsx
│   ├── pages/
│   │   ├── HomePage.tsx
│   │   ├── OrderEntryPage.tsx
│   │   ├── OrderListPage.tsx
│   │   ├── OrderDetailPage.tsx
│   │   ├── ProductDetailPage.tsx
│   │   └── ShopListPage.tsx
│   └── styles/
│       └── globals.css
├── data/                           # Created at runtime
│   ├── db.json
│   ├── images/
│   │   ├── original/
│   │   └── thumbnails/
│   └── backups/
└── public/
    └── favicon.ico
```

---

## Testing Checklist

### Image Upload
- [ ] File selection works (JPG, PNG, WebP)
- [ ] Clipboard paste (Ctrl+V) works
- [ ] Drag and drop works
- [ ] Invalid format rejected with error message
- [ ] Large file (>10MB) rejected with error message
- [ ] Thumbnail auto-generated correctly (480×640)
- [ ] Preview shows after upload

### Order Entry Flow
- [ ] Can create order with all three categories
- [ ] Can create order with only purchased items
- [ ] Multi-entry specs (卡头/封口贴/长贴) work correctly
- [ ] Calculations are accurate
- [ ] Images upload and display correctly
- [ ] Data persists after page refresh

### Search & Filter
- [ ] Product name search is case-insensitive
- [ ] Shop name search returns correct products
- [ ] Pagination works correctly
- [ ] Search result count is accurate

### Order Management
- [ ] Orders display in correct sequence
- [ ] Sorting by amount/ratio works
- [ ] Edit functionality preserves data integrity
- [ ] Links between pages work correctly

### Product Details
- [ ] All entries displayed grouped by category
- [ ] Multiple entries in same category show separately
- [ ] Links to order details work
- [ ] Only non-zero specs are shown

### Data Persistence
- [ ] Data survives page refresh
- [ ] Data survives app restart
- [ ] Backup files created on save
- [ ] Can recover from backup if db.json corrupted

---

## Future Enhancements (Out of Scope)

1. Export orders to Excel/CSV
2. Bulk import from spreadsheet
3. User authentication and multi-user support
4. Order deletion with confirmation
5. Analytics dashboard with charts
6. Mobile app version
7. Barcode scanning for products
8. Automatic shop name suggestions
9. Product duplication/templates
10. Order status tracking

---

## Glossary

| 中文术语 | English | Description |
|---------|---------|-------------|
| 店铺 | Shop | Vendor/seller where products are purchased |
| 商品 | Product | Merchandise item |
| 规格 | Specification | Product variant/SKU with specific attributes |
| 已购商品 | Purchased Item | Items bought with purchase price |
| 礼品 | Gift | Promotional items given to customers |
| 小礼物 | Small Gift | Additional small promotional items |
| 订单金额 | Order Total | Total cost of purchased items |
| 小礼物总价 | Small Gift Total | Total value of small gifts |
| 小礼物占比 | Gift Ratio | Percentage of small gifts relative to order total |
| 购入价 | Purchase Price | Cost to buy the item |
| 原价 | Original Price | MSRP/retail price |
| 满赠礼 | Full Purchase Gift | Gift for reaching spend threshold |
| 宣传礼 | Promotional Gift | Marketing/advertising gift |
| 手速礼 | Quick Purchase Gift | Gift for fast/early buyers |
| 高消礼 | High Spender Gift | Gift for high-value purchases |

---

## Document Change Log

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-04-04 | Initial design document | AI Assistant |
| 1.1 | 2026-04-04 | Added: Windows local app, JSON storage, local images, clipboard paste | AI Assistant |
| 1.2 | 2026-04-05 | Updated: Image size to 640×480, simplified ImageViewer (click-to-close), focus-based clipboard paste, clickable order rows, custom spec types, sequence number display logic, auto-reorder on deletion, product deduplication | AI Assistant |
| 1.3 | 2026-04-05 | Updated: ProductCard to object-contain for complete image display, ImageViewer with wheel zoom (0.5x-5x) and drag pan (no visible buttons) | AI Assistant |
| 1.4 | 2026-04-05 | Updated: ProductCard to object-cover for center-crop fill (no empty space) | AI Assistant |
| 1.5 | 2026-04-05 | Updated: Product gallery uses original images with object-contain (consistent with order detail), shop name editable in order detail page | AI Assistant |
| 1.6 | 2026-04-05 | Fixed: ProductCard image centering using absolute positioning (top/left 50% with translate) | AI Assistant |
| 1.7 | 2026-04-05 | Updated: ProductCard responsive with aspect-[4/3] and object-cover fill, ProductDetailPage left-right layout (image 1/3, info 2/3) | AI Assistant |
| 1.8 | 2026-04-05 | Fixed: ProductDetailPage left-right layout (image 640px fixed, records flexible) - records now alongside image | AI Assistant |
| 1.9 | 2026-04-05 | Updated: OrderDetailPage items to responsive grid layout (2/3/4/5 columns) with card-style display, reduces whitespace | AI Assistant |
| 1.10 | 2026-04-05 | Updated: OrderDetailPage items to auto-fill grid (max 200px item width) with original images (not thumbnails) | AI Assistant |
| 1.11 | 2026-04-05 | Updated: OrderDetailPage item max width increased from 200px to 215px | AI Assistant |
| 1.12 | 2026-04-05 | Fixed: OrderEntry steps (StepPurchased, StepGifts, StepSmallGifts) now support clipboard paste with enableClipboard={true} | AI Assistant |
| 1.13 | 2026-04-05 | Updated: (1) Order entry pages support global clipboard paste without focus requirement (2) New item creation clears specification selections (3) Fixed specification display order in OrderDetailPage and ProductDetailPage | AI Assistant |
| 1.14 | 2026-04-05 | Added: Two new specification types - "其他贴纸" (with custom name support, after 长贴) and "吊牌" (after 贴纸包) | AI Assistant |

---

END OF DOCUMENT
