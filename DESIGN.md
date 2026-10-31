# 文创商品订单管理系统 — 当前实现设计文档

## 1. 文档定位

- **版本**：1.27（查询与图片页面加载优化）
- **核对基线**：Git `b7e1edd` 及本次性能优化；不修改用户数据格式、统计规则或图片文件。
- **性质**：当前实现说明（as-built），不是未来架构提案或已通过测试的证明。
- **依据**：`package.json`、`vite.config.ts`、`src/`、`server/`、`scripts/`；业务目标另见 `需求.md`。
- **维护规则**：实现行为与需求不一致时，本文件记录实际行为，并在“限制与待改进”中列出差异；不得把未实现能力描述为已完成。

本文替代旧设计中 Electron/IPC、浏览器 LocalStorage、固定图库分页、内存常驻数据库等方案描述。历史版本1.0–1.23用于理解演进，不作为当前实现依据。

## 2. 系统概述

面向本地单用户的文创商品订单管理应用，以中文界面管理店铺、商品、订单和心愿商品。用户通过浏览器访问本地前端，后端操作JSON文件与图片文件，无需安装数据库。

### 2.1 已有功能

1. 商品图库：按商品名或店铺名搜索、渐进显示、图片查看、跨订单商品详情。
2. 单店铺订单：店铺→已购商品→礼品→小礼物的四步录入、分类编辑、删除。
3. 拼单订单：按多个店铺录入商品、编辑店铺及商品、修改拼单名称、逐商品标记到货。
4. 订单总览：店铺/拼单分栏、金额与占比排序、下单/发货时间、发货时长、到货状态、备注。
5. 已购店铺与仅心愿店铺：从店铺列表跳转并按店铺筛选。
6. 心愿商品：同店铺多商品添加、名称/店铺编辑、删除、录入订单时复用图片并清理对应心愿。
7. Set商品：跨订单汇总数量、筛选符合条件商品、最多9张原图拼接。
8. 散件商品：规格数量汇总、分类多选过滤、保留返回时的分类参数。

### 2.2 范围边界

当前没有 Electron 桌面包装、安装包生成、用户认证、多用户隔离、远程数据库、Excel导入导出或完整生产部署流程。`start.bat` 是Windows开发服务启动脚本，不是独立桌面程序。

## 3. 架构与运行

```text
浏览器（React SPA）
  │ fetch /api/*；图片 /images/*；拼接图 /append/*
  ▼
Vite 开发服务（默认5173）
  │ /api 与 /images 代理到 localhost:3001
  ▼
Express（3001）
  ├─ routes/：HTTP API、订单业务、统计与图片拼接
  ├─ services/database.ts：JSON加载/保存、实体操作
  ├─ services/imageService.ts：原图、缩略图、文件复制/改名/删除
  └─ data/：db.json、images/、backups/、append/
```

`/append` 由Express提供，但当前Vite开发代理没有该项。因此生成文件成功不等于前端同源“查看图片”链接可用；完整转发是待改进项。

### 3.1 技术栈

| 层 | 当前依赖 |
| --- | --- |
| 前端 | React 18.3、React Router 6、TypeScript 5、Tailwind CSS 3 |
| 开发构建 | Vite 5、@vitejs/plugin-react、PostCSS、autoprefixer |
| 后端 | Node.js、Express 4、cors、multer内存上传 |
| 图片 | sharp 0.33 |
| ID | uuid 10 |
| 开发进程 | tsx watch、concurrently |

具体版本范围和锁定版本以 `package.json`、`package-lock.json` 为准。项目为ESM（`type: module`）；前端 `@/` 指向 `src/`，后端沿用带 `.js` 后缀的本地模块导入。

### 3.2 启动与构建

```sh
npm ci                  # 使用现有锁文件安装依赖
npm run dev             # 同时启动前后端
npm run dev:client      # vite
npm run dev:server      # tsx watch server/index.ts
npm run build           # tsc && vite build
npm run preview         # 仅前端构建预览
```

- 前端默认 `http://localhost:5173`；Vite可能因端口冲突选择其他端口。
- 后端固定3001，`app.listen(PORT)` 未显式限定loopback绑定地址，且启用了默认CORS；“本地用途”不等于已经限制外部访问。
- `start.bat`：切换到项目根目录，缺少 `node_modules` 时 `npm install`，启动开发服务，等待5秒后打开浏览器。
- `build` 的静态输出为 `dist/`。后端仍由tsx独立运行，Express当前不托管 `dist/`。
- `preview` 不启动后端；不能把单独静态托管前端当作完整应用部署。
- 当前没有 `test`、`lint`、`electron:build` 或生产后端打包/启动脚本。
- `tsconfig.json` 覆盖 `src` 并引用 `tsconfig.node.json`；后者覆盖后端及Vite配置。两者启用严格与未使用检查，单次前端构建不应当作完整后端功能验证。

## 4. 数据模型

定义源为 `src/types/index.ts`。时间字段持久化为字符串而非JavaScript `Date`；图片字段是文件名，不含 `images/original/` 前缀。以下为持久化实体概览。

```ts
interface Shop {
  id: string
  name: string
  createdAt: string
}

interface Product {
  id: string
  name: string
  imagePath: string
  thumbnailPath: string
  createdAt: string
}

type ItemCategory = 'purchased' | 'gift' | 'smallGift'
type OrderType = 'shop' | 'group'
type DeliveryStatus = '未到货' | '已到货'

interface Specification {
  type: SpecificationType
  customType?: string
  sequenceNumber: number
  quantity: number
  purchasePrice?: number
  originalPrice: number
}

interface OrderItem {
  id: string
  productId: string
  category: ItemCategory
  giftType?: GiftType
  customGiftType?: string
  specifications: Specification[]
  shopId?: string
  arrived?: boolean
}

interface Order {
  id: string
  sequenceNumber: number
  orderType: OrderType
  shopId: string
  shopIds?: string[]
  groupOrderName?: string
  items: OrderItem[]
  totalAmount: number
  giftTotal: number
  smallGiftTotal: number
  giftRatio: number
  note?: string
  deliveryStatus?: DeliveryStatus
  orderTime?: string
  shippingTime?: string
  createdAt: string
}

interface WishItem {
  id: string
  shopId: string
  productId: string
  productName: string
  imagePath: string
  thumbnailPath: string
  createdAt: string
}

interface Database {
  version: string
  lastModified: string
  nextOrderSequence: number
  shops: Shop[]
  products: Product[]
  orders: Order[]
  wishItems?: WishItem[]
}
```

### 4.1 关联与兼容行为

- 店铺订单使用顶层 `Order.shopId`；拼单使用 `shopIds` 及每个 `OrderItem.shopId` 关联实际店铺。
- 拼单顶层 `shopId` 指向名为“拼单”的特殊店铺记录，并非固定字符串 `GROUP`。店铺列表接口按名称排除该记录。
- `Product` 没有直接的 `shopId`，店铺归属从订单及订单项推导。
- 新录入通常为各订单项创建新的Product UUID；`findOrCreateProduct` 实际总是新增，不按名称复用。相同图片文件名可能被多个Product引用。
- 心愿条目保存独立的名称/图片字段；创建时生成 `productId`，但不向 `db.products` 插入对应Product，不能把心愿 `productId` 当作已有商品外键。
- 单店铺POST当前未显式写入 `orderType`。读取订单时缺少 `orderType` 视为 `'shop'`，缺少 `giftTotal` 补0；这属于返回对象兼容处理，不是完整的持久化迁移。
- 订单详情返回 `shop`（拼单为null）、可选 `shops`、以及带Product的 `purchasedItems/gifts/smallGifts`。列表返回 `OrderSummary`；商品详情返回 `ProductDetail.entries`。
- 当前订单详情响应不带备注、到货状态和下单/发货时间，即使共享类型允许这些字段；这些信息在列表摘要中提供。

### 4.2 规格与礼品类型

规格输入顺序：

> 试吃set、小食量set、大食量set、折页、异形折页、卡背、卡头、封口贴、长贴、其他贴纸、贴纸包、吊牌、封箱贴、售后卡、豆丁贴、gift贴、磨砂盒、其他衍生。

显示顺序将前三项改为 **大食量set、小食量set、试吃set**，其余顺序相同。同类型再按 `sequenceNumber` 排序，源为 `SPECIFICATION_DISPLAY_ORDER` 和 `sortSpecifications()`。

- 多条追加类型：卡头、封口贴、长贴、其他贴纸、其他衍生。
- 其他贴纸/其他衍生通过 `customType` 输入自定义名称。
- 录入表单选中新规格默认为数量1、原价0；已购另有购入价0。价格输入 `min=0`，不是旧设计中的“严格正数”。数量使用整数解析，空/0输入回退1；HTML约束不等于后端验证。
- 追加序号取当前同类型最大序号+1，删除不保证立即连续重排。
- 详情页按单条订单项的“显示名称”统计多条规格，只有同名多条时显示序号，不是整个订单跨商品统一计数。
- 礼品类型：满赠礼、宣传礼、手速礼、高消礼、小时礼、新客礼、回购礼、其他。`giftType: '其他'` 时可保存 `customGiftType`。

## 5. 金额、排序和状态

### 5.1 金额计算

由订单POST/PUT计算并保存：

```text
订单金额 totalAmount = Σ 已购规格(quantity × (purchasePrice || 0))
礼品总价 giftTotal = Σ 礼品规格(quantity × originalPrice)
小礼物总价 smallGiftTotal = Σ 小礼物规格(quantity × originalPrice)
giftRatio = totalAmount > 0
  ? Math.round(smallGiftTotal / totalAmount × 1000) / 10
  : 0
```

金额使用JavaScript Number计算，显示两位小数；占比保存到一位小数，订单金额≤0时详情/列表显示 `-`。拼单仅计算已购金额，礼品总价、小礼物总价及占比保存0。尚无整数分币或统一高精度金额层。

### 5.2 三种编号

| 编号 | 来源与含义 |
| --- | --- |
| `Order.id` | 稳定UUID，用于路由与关联 |
| `sequenceNumber` | 持久化的全部订单录入序号；单店铺详情/商品记录使用它 |
| `groupSequenceNumber` | 按拼单 `createdAt` 升序即时计算的独立序号，用于拼单详情/商品记录 |
| 列表序号 | 店铺与拼单各栏按当前排序结果 `index + 1` 显示 |

新增订单使用 `nextOrderSequence` 后自增。删除订单时按 `createdAt` 重排全部订单的 `sequenceNumber`；当前删除逻辑没有同步重置 `nextOrderSequence`，后续加载可能再次纠正空缺。不要假定列表序号和详情编号总一致。

### 5.3 默认与手动排序

- 默认：有 `orderTime` 的订单按时间升序，随后无时间订单按持久化序号升序。
- 点击订单金额、礼品总价、小礼物占比列：首次降序，再次点击切换升/降序；后端排序后前端分栏。
- 当前没有显式“恢复默认排序”按钮。
- 修改下单时间后只更新当前行并结束编辑，不重新请求列表、不立即重新排序，保持当前行顺序和滚动位置，与发货时间和备注一致。之后重新进入、手动刷新列表或切换排序时，仍使用后端的默认/手动排序规则。发货时间不参与排序。

### 5.4 时间、备注与到货

- 下单输入提示 `YYYY-MM-DD HH:mm:ss`，按浏览器Date解析转ISO；发货输入 `YYYY-MM-DD`，按本地午夜转ISO。显示为浏览器本地时间，不是所有字段都强制北京时间。
- 时间和备注通过Enter或失焦PATCH保存，Esc取消；空时间清除字段。
- 发货时长：无下单时间显示 `-`；有发货时间用本地归零后的日期差；无发货时间用偏移计算的北京时间当前日期，最终 `Math.floor(毫秒差/86400000)` 显示天数。没有定时器驱动实时刷新，跨时区/DST一致性仍需验证。
- 整单到货下拉默认未到货，已到货绿色、未到货红色。
- 拼单商品 `arrived` 通过专用PATCH更新；全部商品已到货时把整单改为已到货。取消某项到货时保留原整单状态；整单下拉也不反向修改商品，当前不是双向同步。

## 6. 页面与交互

路由集中在 `src/App.tsx`，所有页面由 `MainLayout` 与左侧 `Sidebar` 包裹。

| 路由 | 页面/主要职责 |
| --- | --- |
| `/` | HomePage：商品搜索与图库 |
| `/wishes` | WishListPage：心愿图库与添加 |
| `/set-products` | SetProductsPage：Set汇总与拼接 |
| `/loose-items` | LooseItemsPage：散件汇总与分类过滤 |
| `/order-entry` | OrderEntryPage：单店铺四步录入 |
| `/group-order-entry` | GroupOrderEntryPage：拼单按店铺录入 |
| `/orders` | OrderListPage：订单总览、排序、行内编辑 |
| `/orders/:id` | OrderDetailPage：商品分类、编辑与删除 |
| `/products/:id` | ProductDetailPage：商品与跨订单记录 |
| `/shops` | ShopListPage：有订单的店铺 |
| `/wish-shops` | WishShopListPage：仅心愿店铺 |

### 6.0 统一返回与浏览状态恢复

订单详情和商品详情统一使用 `BackButton`，按钮文字为“返回上一页”。有站内历史时调用 `navigate(-1)`，不再按固定列表地址或商品详情 `from` 参数决定目的地。录入步骤的“上一步”、分页的“上一页”及弹窗取消保留各自原有用途。

- 以页面URL与React Router的 `location.key` 组合区分历史访问，即使同一URL多次访问也有独立快照；URL部分避免直接载入页面的默认key跨页面混用。
- `MainLayout` 通过 `useScrollRestoration` 保存浏览器窗口与main容器的横/纵滚动位置。返回、前进和刷新恢复当前历史项；新历史项从顶部开始。
- API加载期间用 `data-scroll-loading` 标记等待，列表/图片布局生成后再恢复位置，支持慢请求；用户主动滚动或操作时停止自动恢复，避免拉回原处。
- `useHistoryState` 保存小型浏览偏好：订单排序、商品搜索及已显示数量、心愿已显示数量、Set选择及拼接提示。散件分类和心愿搜索保留在URL，修改筛选使用replace而非额外加入页面历史。
- 路由视图按历史key重新挂载并重新读取API，既恢复偏好又获取最新业务数据，不缓存订单/商品API响应或录入草稿。
- 快照保存到当前标签页 `sessionStorage`，最多80个最近历史项；滚动坐标立即更新内存、存储写入按150ms合并，未改变坐标不重复写入，点击导航前和pagehide同步落盘。存储不可用时降级到内存。关闭标签页后不保证恢复；超出保留范围、数据删除或窗口尺寸变化时位置可能被当前可滚动范围限制。
- 直接打开详情且没有站内前页时，订单详情替换导航到 `/orders`，商品详情到 `/`；避免退到未知外部页面。

### 6.1 商品图库

- `productApi.search` 一次获取全量结果，在前端渐进显示，不是后端分页。
- 初始显示50项，用IntersectionObserver检测底部加载，展示总数、已显示数量和全部加载提示。
- 每次触底最多追加50项；历史返回先恢复已显示数量，避免深处商品尚未渲染而只能回到列表顶部。
- 网格为 `repeat(auto-fill,minmax(200px,1fr))`；商品卡片4:3缩略图、居中 `object-cover`，商品名跳转详情，店铺名作为辅助信息。
- 缩略图通过原生 `loading=lazy` 或 `LazyImage` 渐显，点击图库图片查看原图。
- `/?shop=店铺名` 初始化店铺搜索；搜索组件同步初始参数并支持显式搜索。当前没有通用300ms去抖搜索层。

### 6.2 单店铺订单录入

`components/order/OrderEntry/` 以React state保存未提交草稿：

1. **店铺信息**：输入店铺名；失焦发现同名时确认是否同一店铺，不同则添加后缀。
2. **已购商品**：商品标签页、手动输入/已有商品及心愿选择、图片、规格、购入价和原价。新商品的规格选择清空。
3. **礼品**：可选本订单/同店铺商品、心愿或手动输入；填写礼品类型和原价，支持其他自定义礼品名称。
4. **小礼物**：同样可复用商品图片或手动输入，填写规格和原价。

同名检测主要在失焦时于前端执行；不同商品添加数字后缀，同一商品/心愿确认可填充已有图片。检测范围与是否精确限定同店铺取决于调用方，不由数据库唯一约束保证。

录入页每次只展示当前商品，可全局Ctrl+V粘贴；另支持共享上传组件的文件选择和拖拽。步骤可返回，最终组装multipart一次创建订单；成功后前端清理 `isFromWish` 对应心愿，再跳转详情。草稿没有持久化，刷新可能丢失。

### 6.3 拼单录入与编辑

- 录入按店铺标签切换，允许新增/删除店铺；至少保留一个店铺，不要求至少两个。
- 每店铺多个商品，选择/手动输入商品、复用图片、规格购入价及原价；切换店铺时当前商品标签重置。
- 新增店铺和提交前检查店铺名、商品名、图片或预览、至少一条规格。
- 编辑器按稳定 `shopId` 管理店铺分组，支持折叠、新增/删除店铺、修改名称、选择已有商品及编辑规格。
- 切换到已存在店铺时会更新组及各商品 `shopId`，保持商品集合；直接改名由后端 `renameShop` 同步关联数据。
- 拼单编辑界面有心愿商品选项，但只选心愿会得到空 `productId`，保存校验仍要求新上传图片；当前未实现无上传直接复用心愿图片的完整编辑链路。

### 6.4 订单总览

店铺订单和拼单订单分栏，空栏目不渲染。两栏使用同一表格布局：序号4%、店铺名称15%、金额/礼品/小礼物/占比各7%、下单11%、发货/时长/到货各7%、备注21%。点击普通行进入详情，编辑单元格阻止行跳转。

拼单店铺列显示 `groupOrderName || '拼单'`，不是实际店铺列表。排序和行内编辑规则见第5节。

### 6.5 订单详情与编辑

- 顶部显示编号和店铺/拼单名称，可编辑名称、删除订单（确认后执行）、返回列表。
- 汇总始终显示金额、礼品总价、小礼物总价、占比四项；拼单也保留零值汇总。
- 店铺订单有已购、礼品、小礼物三个栏目，各有编辑入口；拼单仅显示已购栏目与整体拼单编辑器。
- 商品网格 `repeat(auto-fill,minmax(150px,230px))` 居中，不是旧设计的215px上限。
- 商品卡片使用4:3缩略图，点击看原图；已购显示购入价及小计，赠品显示原价及小计。
- 礼品按类型/自定义名称分组，拼单按店铺分组，在组的首商品上方绝对定位标签；包装项都加 `mt-8`。
- 拼单卡片带到货复选框。规格按显示顺序排序；订单详情当前不滤掉数量0，商品详情会过滤。
- 编辑使用弹层，顶部保存/取消，横向图片与商品字段、规格行、虚线添加入口；多商品粘贴按焦点选择目标。
- 单店铺分类编辑仍提交全部三类数组以保留其他栏目。PUT不是按单个栏目局部合并，调用方若遗漏数组可能清空该类别。

### 6.6 商品详情

- 左侧容器固定640px，先展示640×480缩略预览，原图异步解码完成后替换为按容器宽度显示的完整原图；右侧自适应展示已购/礼品/小礼物记录。缩略图只是临时预览，最终原图不会按缩略图比例裁剪；原图来源不等于始终1:1像素展示。
- 后端先从订单找商品店铺，再聚合该店铺同名商品的多个Product ID；店铺名精确匹配，商品名大小写无关。未找到归属时至少保留请求Product。
- 每条订单项作为单独记录，不因同商品、同类别或同订单重复而消失；只展示数量>0的规格。
- 已购记录显示购入价和原价，礼品/小礼物显示原价，各有订单跳转。
- 详情返回使用真实浏览器历史，不再依赖 `from` 参数；散件分类留在前页URL并随历史恢复。商品链接不再添加冗余来源参数。
- 商品详情礼品数据当前只带 `giftType`，未带 `customGiftType`，因此自定义名称可能显示成“其他”。

### 6.7 店铺列表与心愿

**店铺列表**：显示序号、加粗名称、创建日期和总数。已购店铺从订单顶层/订单项提取关联，排除名称“拼单”；心愿店铺必须有心愿且无订单引用。点击分别跳到 `/?shop=...` 和 `/wishes?shop=...`。

**心愿图库**：搜索、50项渐进显示、4:3缩略图和原图查看。悬浮编辑/删除按钮；编辑只改商品名、店铺，不更换图片。后端修改条目名称/店铺ID，不同步改图片文件名。

**添加弹窗**：可从全部非特殊店铺选择或手动输入，一次填写同店铺多个商品；支持文件选择和按目标聚焦的粘贴，使用独立上传逻辑，不沿用通用ImageUploader校验。提交只筛选名称和图片完整的条目，逐个POST；失败可能已有部分保存。重名弹层确认不同商品时直接添加 `(2)`，不保证该后缀全局唯一。

### 6.8 Set和散件统计

两种统计均遍历所有订单项（包含已购、礼品、小礼物），按大小写无关的店铺名+商品名汇总，不按订单类别或到货状态过滤。代表商品ID/图片取遍历遇到的首条，不保证最新。接口仍返回全量数据，但两页首批只渲染50项，靠近底部时逐批追加50项；已显示数量按历史项保存，返回时恢复。两页没有搜索栏或传统分页按钮。

Set、散件、商品详情以及订单列表/详情的GET请求各读取一次数据库快照，再构建Product/Shop ID Map查询，循环中不再逐项重新加载整个JSON。商品详情保持原有同店铺同名聚合和记录顺序，统计返回值不变；Map仅存在于本次请求，没有跨请求的数据库缓存。

**Set**：累加大食量set、小食量set、试吃set；条件为大>0或小>0或试吃≥5。依次按大、小、试吃数量降序。卡片显示店铺、正数规格和详情链接。

**散件**：分类按钮多选采用OR匹配，未选时显示全部；选中后卡片只显示对应分类的正数规格。分类为折页（含异形）、卡头、卡背、贴纸（封口贴/长贴/其他贴纸）、贴纸包、衍生贴纸（封箱贴/豆丁贴/gift贴）、售后卡、磨砂盒、其他衍生。

- 标准规格直接累计数字，多条类型按序号累计；自定义规格按 `${customType || 默认名}_${sequenceNumber || 1}` 累计。
- 跨订单相同序号会合并；散件展示固定带序号，与详情页“仅多条显示序号”规则不同。
- 当前吊牌不在散件汇总/分类中。字典类型的筛选检查键存在，不检查汇总值>0，可能纳入只有零数量键的商品。

## 7. 搜索与去重

实现源为 `server/services/database.ts`：

1. 关键字trim、转小写，名称匹配使用includes。
2. 空查询或商品名搜索只取已被任何订单项引用的Product，包含赠品，不是只取purchased。
3. 店铺搜索先找匹配店铺；普通订单检查 `order.shopId`，拼单检查 `item.shopId`，再收集商品。
4. 商品的店铺显示名由首个引用订单项推导。
5. 按创建时间升序，以小写店铺名+商品名去重，**保留最早记录**，最终按创建时间降序返回。

这与需求文档“同一商品名仅显示一次，保留最新”不同。心愿搜索不采用此Product去重，按心愿 `createdAt` 降序返回；按店铺精确取心愿的 `by-shop` 返回值也不含增强的店铺显示字段。

## 8. 图片处理与拼接

### 8.1 上传、存储与显示

共享 `ImageUploader` 接收JPG/PNG/WebP，前端检查MIME和≤10MB。文件选择、拖拽、粘贴均交给回调；`alwaysListenClipboard` 用于单商品录入，`enableClipboard && isFocused` 用于多商品编辑。心愿添加采用独立逻辑，不具有完全相同的类型/大小限制。

后端multer使用memoryStorage，没有显式 `limits` 或 `fileFilter`。sharp失败交给全局错误处理中间件，不能把前端限制当作API强制限制。

命名：

```text
订单图片：清洗后的店铺名_商品名.原扩展名
心愿图片：心愿_清洗后的店铺名_商品名.原扩展名
通用上传：UUID.原扩展名
缩略图：对应文件名去支持的扩展名后加 _thumb.jpg
```

非法Windows文件名字符及空白替换为 `_`。原图保存原buffer，sharp生成640×480、cover居中裁剪、质量85 JPEG缩略图。数据库只存文件名；图片URL由前端拼接。

- 普通商品/心愿/订单详情/Set/散件卡片实际使用缩略图；查看器和商品详情最终使用原图。共享LazyImage使用原生lazy与异步解码，按src管理加载状态、兼容缓存命中，并memo减少无关重复渲染。商品详情另用ProgressiveImage先展示缩略预览，不等待大原图才显示图片区域。
- `copyAndRenameImage` 复制原图/缩略图，缩略图不存在时重新生成。
- 改店铺名调用 `renameShop`，尝试更新该店铺相关Product、心愿和图片文件名；文件操作失败被容错处理，不保证JSON/文件一致性。
- 同店铺同商品同扩展名会写入同路径，可能覆盖原图；删除引用检查以Product ID为主，不具备共享图片路径引用计数。

### 8.2 原图查看器

`ImageViewer` 为全屏遮罩，图片初始适配最大90vw/90vh。滚轮倍率范围0.5–5，倍率>1可拖动平移；点遮罩或Esc关闭，点图片不关闭。无可见操作按钮，有底部操作提示；打开时禁止body滚动。

### 8.3 拼接

前端以 `imagePath` 为选择集合，最多9个唯一路径，显示选中边框、计数、清空及生成按钮。Set迭代顺序即选择顺序，成功后清空选择并提供新窗口查看链接；不是按屏幕卡片顺序自动排序。

后端 `POST /api/products/merge-images` 读取原图，目标1200×1800（6:9），网格如下（列×行）：

| 张数 | 网格 |
| --- | --- |
| 1 | 1×1 |
| 2 | 1×2 |
| 3 | 1×3 |
| 4 | 2×2 |
| 5–6 | 2×3 |
| 7–9 | 3×3 |

各图cover居中裁剪到单元格，白色背景，未填充格留白，按行优先排列；最终质量95 JPEG。写入 `data/append/merged_时间戳.jpg`，返回 `{success, filename, path: '/append/文件名', count}`。不写入db.json，也无自动清理拼接文件机制。

## 9. HTTP API契约

前端通用请求封装在 `src/api/client.ts`，以 `/api` 为base，非2xx尝试读取JSON `message` 并抛错；部分页面直接fetch PATCH，没有统一响应状态检查。

通用客户端合并同时进行的相同URL无额外选项GET请求，避免StrictMode等场景的重复读取。请求结束或失败后立即移除，非GET操作清理待合并记录；不缓存已完成响应，返回页面仍请求最新数据。带独立RequestInit的读取不合并。

### 9.1 店铺、商品与图片

| 方法 | 路径（省略/api） | 输入 / 返回 |
| --- | --- | --- |
| GET | `/shops` | 有订单非“拼单”店铺，Shop[] |
| GET | `/shops/wish` | 仅心愿店铺，Shop[] |
| GET | `/shops/all` | 全部非“拼单”店铺，Shop[] |
| POST | `/shops` | JSON `{name}`，201 Shop；不强制去重 |
| GET | `/products` | 全部持久化Product（不限有订单），Product[] |
| GET | `/products/search` | query `type=productName\|shopName`、`keyword`，去重商品+shopName |
| GET | `/products/set-products` | Set数量汇总数组 |
| GET | `/products/loose-items` | 散件数量/字典汇总数组 |
| GET | `/products/:id` | ProductDetail及分类entries |
| POST | `/products/merge-images` | JSON `{imagePaths: string[]}`，拼接结果 |
| POST | `/images/upload` | multipart `image`，`{imagePath, thumbnailPath}` |

### 9.2 订单

| 方法 | 路径（省略/api） | 输入 / 返回 |
| --- | --- | --- |
| GET | `/orders` | query `sortBy=totalAmount\|giftTotal\|giftRatio`、`order=asc\|desc`，OrderSummary[] |
| GET | `/orders/:id` | 分类商品、店铺及汇总详情 |
| POST | `/orders` | 单店铺multipart，201 Order |
| POST | `/orders/group` | 拼单multipart，201 Order |
| PUT | `/orders/:id` | 普通/拼单完整商品数组，更新后Order |
| DELETE | `/orders/:id` | 删除订单、孤立Product及图片，`{success, message}` |
| PATCH | `/orders/:id/note` | JSON `{note}` |
| PATCH | `/orders/:id/delivery-status` | JSON `{deliveryStatus}` |
| PATCH | `/orders/:id/order-time` | JSON `{orderTime}`，空值清除 |
| PATCH | `/orders/:id/shipping-time` | JSON `{shippingTime}`，空值清除 |
| PATCH | `/orders/:id/group-order-name` | JSON `{groupOrderName}`，仅拼单，空值回退“拼单” |
| PATCH | `/orders/:id/items/:itemId/arrived` | JSON `{arrived}`，仅拼单；严格true为到货 |

PATCH成功返回更新后的Order；不存在订单/商品返回404，非法枚举、时间或错误订单类型返回400。时间验证使用Date可解析性，不是严格格式schema。

**multipart字段约定**：

- 普通POST/PUT：`shopName`（PUT可选）、`purchasedItems`、`gifts`、`smallGifts` 均为字符串/JSON字符串；图片为 `purchasedImage_i`、`giftImage_i`、`smallGiftImage_i`。
- POST项包含 `productName`、`specifications`、可选 `existingImagePath`；礼品另有 `giftType/customGiftType`。有文件优先保存，否则复制已有路径，无图片来源返回400。
- 普通PUT项包含 `id/productId/productName/specifications`；已有Product无变更保留ID，仅改图更新Product，仅改名修改Product名，两者同时改变则创建新Product。已购处理中的Product ID替换映射会传给本次礼品/小礼物处理，不是全库事务级替换。
- 拼单POST：`shops` JSON数组 `[{shopName, items:[...]}]`；文件 `shop{店铺索引}_item{商品索引}`。无文件/已有路径时，还会尝试全库按商品名查找，未严格限定店铺。
- 拼单PUT：`orderType='group'`、`items`、`shopIds`、`shopNames`（ID→名称JSON对象）；文件 `item_{订单项id}`。前端临时项ID以 `temp_` 开头，后端转换UUID。
- 拼单PUT重建items未保留 `arrived`，已标记商品编辑后可能丢失到货标记。

### 9.3 心愿

| 方法 | 路径（省略/api） | 输入 / 返回 |
| --- | --- | --- |
| GET | `/wishes` | 全部增强心愿（含shopName） |
| GET | `/wishes/search` | query `type`、`keyword`，增强心愿数组 |
| GET | `/wishes/by-shop` | query `shopName`，精确店铺名的原始WishItem数组；无名称返回[] |
| POST | `/wishes` | multipart `shopName/productName/shopId?`、`image`，201 WishItem |
| PUT | `/wishes/:id` | JSON `productName/shopName`，修改后的心愿+shopName |
| DELETE | `/wishes/by-product` | query `shopName/productName`，删除首个精确匹配心愿及其图片，`{success}` |
| DELETE | `/wishes/:id` | 删除条目及图片，`{success:true}` |

心愿转订单不是上述POST/PUT的后端事务：前端先保存订单，再逐项按店铺/商品名DELETE，失败只记录console错误。重复同名心愿可能只删除第一条。

### 9.4 错误处理

路由try/catch交给Express错误处理中间件：MulterError返回400，其他异常返回500 JSON `{message}` 并在控制台记录。缺失数据等由路由显式400/404处理。没有统一输入schema、事务回滚或错误码枚举。

## 10. 本地持久化与维护

```text
data/
  db.json
  images/
    original/               原始上传文件
    thumbnails/             640×480 JPEG缩略图
  backups/                  最近10份JSON备份
  append/                   拼接结果
```

路径由后端模块位置解析到项目根目录 `data`，不是浏览器存储。`data/` 被Git忽略。

### 10.1 加载和保存

- 数据服务原子操作仍按调用读取/解析db.json，没有全程常驻缓存。只读商品统计/商品详情/订单列表与详情已改为单次请求复用一个快照和ID索引；`getAllOrders`、`getOrderById` 接受可选快照。写入链路的多个操作仍可能重复读盘，本次未改变写入流程。
- 自动创建data、backups、原图和缩略图目录，append按拼接需要创建。
- 加载发现订单序号空缺/重复时按createdAt重排并直接写回；这一纠正路径没有先调用标准备份。
- 读取/解析异常被统一catch，会调用保存默认数据库；没有区分文件不存在与损坏/权限错误，可能覆盖原有坏库。
- 标准保存前尝试复制原JSON到时间戳备份，按文件名排序保留最近10份；随后更新lastModified、直接覆盖db.json。
- 备份异常被忽略；没有原子临时文件替换、锁、并发写保护、自动恢复或完整schema校验。
- JSON备份不包含图片，迁移与真实数据维护应备份整个data目录。

### 10.2 删除与名称变更

删除订单移除Order、重排全局序号，收集剩余订单关联店铺/Product，同时保留心愿引用的店铺和特殊“拼单”店铺；孤立Product删除后路由删除其图片。PUT删除商品并不执行同样完整的孤立清理。图片可能共享路径，不能保证仅删一个Product不会影响其他记录。

店铺改名作用于共享Shop及其关联数据，不只是修改当前订单显示文字。Product只改名时不会自动改图片名；心愿条目编辑也不改图片名。

### 10.3 维护脚本

- `python3 scripts/merge_group_orders.py`：交互选择目标/来源拼单，合并店铺与items、重算金额、删除来源订单、重排序号，写入前备份JSON。该脚本金额使用 `purchasePrice or originalPrice`，与API仅用购入价规则不同，0购入价会回退原价。
- `node scripts/rename-wish-images.cjs`：将心愿UUID图片改为语义名称并更新WishItem路径；没有自动备份，不是 `.js` 文件。
- 维护脚本不是测试或启动前置步骤。运行前先确认操作范围并备份，避免与服务同时写真实数据。

## 11. 当前限制与待改进

下列是静态源码核对结果，未在本次启动应用复现；不表示已修复。

| 类别 | 当前限制 / 与目标差异 |
| --- | --- |
| 图库 | 保留最早同店铺同名记录，非需求中的最新；普通卡片用缩略图而非需求中的原图 |
| 规格/礼品 | 详情序号按订单项显示名称计数；订单详情不滤零数量；商品详情缺自定义礼品名称；散件缺吊牌 |
| 到货状态 | 拼单全到货单向更新整单，取消单项不回退；整单状态不反向同步；拼单编辑可能丢arrived |
| 心愿联动 | 订单保存与删除心愿不是事务；批量添加可部分成功；拼单编辑选择心愿仍需上传图片 |
| API契约 | 单店铺创建未显式写orderType；详情部分类型字段未返回；普通PUT省略类别数组会清空，不是安全局部更新 |
| 校验 | 后端缺统一规格/数量/价格schema、图片大小类型限制及路径边界校验；前端HTML限制可绕过 |
| 错误反馈 | 列表等直接fetch PATCH未检查response.ok，HTTP失败可能仍显示保存成功 |
| 图片一致性 | 语义名称碰撞、共享路径删除风险；JSON与文件操作无事务/回滚；零散Object URL未完整释放 |
| 数据安全 | 加载异常可能初始化覆盖库；备份失败被吞；直接覆盖写无原子性/锁；序号计数器未完整同步 |
| 时间 | 本地时间与北京时间计算混用，非固定UTC+8展示；无定时更新；跨时区/DST需验证 |
| 展示 | 640px商品详情、固定侧栏/表格未形成完整移动端适配，不能承诺所有手机布局可用 |
| 性能 | API仍全量返回JSON，Set/散件按50项渐进渲染；主要只读查询已用单快照/ID索引，但无后台分页或持久化查询索引，大数据传输和写入链路重复读盘仍有优化空间 |
| 服务安全 | 默认CORS、未明确只绑定localhost、无认证；不适合直接公网暴露 |
| 部署 | /append缺开发代理，preview不提供完整后端；无Electron/生产后端发布流程 |

这些问题应另立开发任务确认目标后修复，不通过文档更新悄悄改变实现。

## 12. 源码地图与验证清单

### 12.1 源码地图

| 路径 | 责任 |
| --- | --- |
| `src/App.tsx`、`src/main.tsx` | SPA入口与路由 |
| `src/pages/` | 页面、行内PATCH、状态与跳转 |
| `src/components/layout/` | 侧栏与整体布局 |
| `src/components/order/OrderEntry/` | 单店铺步骤、共享规格输入 |
| `src/components/order/GroupOrderEntry/` | 拼单按店铺录入 |
| `src/components/order/OrderItemEditor.tsx` | 店铺订单分类编辑 |
| `src/components/order/GroupOrderItemEditor.tsx` | 拼单店铺/商品编辑 |
| `src/components/common/`、`src/hooks/useClipboardPaste.ts` | 上传、查看、延迟图片、搜索、分页组件及粘贴 |
| `src/components/wish/` | 心愿卡片与添加弹窗 |
| `src/api/client.ts`、`src/types/index.ts` | 请求封装、共享类型/常量 |
| `src/utils/specificationSort.ts` | 规格显示排序 |
| `server/index.ts` | Express入口、静态路径、全局错误 |
| `server/routes/` | HTTP业务契约与统计/拼接 |
| `server/services/` | JSON及图片文件操作 |
| `src/hooks/useHistoryState.ts`、`src/hooks/useScrollRestoration.ts`、`src/utils/navigationState.ts` | 按历史项保存浏览偏好与滚动快照、等待异步布局恢复 |
| `src/components/common/BackButton.tsx` | 历史返回与直接打开详情时的安全兜底 |
| `src/hooks/useProgressiveList.ts` | Set/散件渐进渲染并按历史项保存批次数 |
| `src/components/common/ProgressiveImage.tsx` | 商品详情缩略预览→完整原图 |
| `scripts/` | 手动数据维护、模拟数据导航回归、查询性能与请求合并验证脚本 |

`Pagination.tsx` 存在不代表图库当前使用固定分页。当前不存在旧结构中的 `src/services/calculationService.ts`、Electron主进程或数据库安装层。

### 12.2 建议验证（未执行）

使用获准的测试副本，避免直接操作个人订单/图片：

- [ ] 安装依赖、前端构建和后端TypeScript检查，记录已有失败，不随意放宽类型配置。
- [ ] 单店铺仅已购/含赠品/零金额录入，确认金额、giftRatio与原图/缩略图持久化。
- [ ] 拼单多店铺录入、现有商品复用、店铺改名及重关联，确认商品未丢失。
- [ ] 分类编辑提交保留另外两类，多条/自定义规格、礼品名称和图片变更正确。
- [ ] 店铺/拼单列表分栏、三种排序、时间清除/保存、备注、行点击与编号差异。
- [ ] 拼单单项到货、取消、全到货、再编辑及整单状态之间的实际行为。
- [ ] 心愿多条添加、重名、编辑、删除、转订单后的图片复制和清理失败反馈。
- [ ] 同名跨店铺/同店铺多订单搜索和详情聚合，验证保留记录与数量。
- [ ] Set统计含赠品、散件OR分类及序号汇总、详情返回保留分类。
- [ ] 拼接1/2/3/4/5/6/7/9张、超过9张拒绝、选择顺序、输出分辨率及/append查看路径。
- [ ] 文件选择/拖拽/粘贴目标隔离、类型/大小校验、查看器缩放拖动/Esc关闭。
- [ ] 服务重启后的数据保存、备份数量、删除共享路径、损坏库和并发写风险（仅隔离副本）。

### 12.3 导航修改的验证记录

新增 `scripts/test-navigation.cjs`，使用Playwright启动仅前端Vite、拦截API并提供虚构数据，不启动后端、不操作真实data目录。Playwright需由本地安装或 `NODE_PATH` 提供：

```sh
NODE_PATH=/path/to/playwright/node_modules node scripts/test-navigation.cjs
```

已通过：订单#100回原列表位置、多层订单/商品实际历史返回、排序保留、浏览器后退/前进与刷新、超过10秒API加载后恢复、搜索图库及加载批次恢复、Set位置及选择、散件筛选与位置、心愿搜索/批次/位置、直接打开详情兜底。

Vite前端生产打包通过。标准 `npm run build` 仍受原有TypeScript项目引用配置影响（TS6306/TS6310）；用独立临时前端配置核对时，修改前后均有26条原有诊断，未增加诊断。本次没有为通过检查而放宽或更改TypeScript配置。

### 12.4 加载优化验证

```sh
node scripts/test-query-performance.cjs
node scripts/test-request-sharing.cjs
NODE_PATH=/path/to/playwright/node_modules node scripts/test-navigation.cjs
```

- 查询测试以虚构120订单、721订单项、180商品进行快照解析模拟，逐项对比 `b7e1edd` 路由结果。Set/散件快照读取723→1，商品详情724→1，订单列表121→1；包含赠品、重复同名、拼单、自定义规格、零数量与缺失商品，返回JSON一致。耗时是合成JSON解析测量，不是用户真实数据的端到端性能承诺。
- 请求合并测试验证并发GET共享、响应不缓存、写操作失效处理、失败可重试。
- 浏览器回归补充验证Set/散件首批50项、继续加载与深处返回、开发StrictMode仅一次Set请求、慢原图之前预览已显示、完整纵向原图加载后替换。
- Vite打包通过。前端/后端独立临时配置检查与基线比较未增加类型诊断；标准build的原有项目引用问题仍未在本次修改。

## 13. 文档演进

| 版本 | 记录 |
| --- | --- |
| 1.0–1.12 | 初始业务与候选架构、JSON/图片存储、订单录入/详情、图片查看与布局迭代 |
| 1.13–1.21 | 全局粘贴、规格扩充、自定义名称、礼品类型/总价、同店铺商品选择与搜索跳转 |
| 1.22 | 下单/发货时间及排序说明 |
| 1.23 | Set原图拼接（1200×1800、data/append） |
| **1.24** | 以当前源码重写为实现设计：明确Vite+Express HTTP、真实实体与API、拼单/心愿/散件/到货功能、存储语义与现有限制；移除未实现架构/命令假设。完整旧正文与历史变更表可从Git中查看。 |
| **1.25** | 两处页面返回入口统一为历史返回；保存滚动位置、列表排序/搜索/加载批次/筛选/Set选择；增加模拟API浏览器回归测试。 |
| **1.26** | 下单时间保存改为当前行本地更新，不触发列表加载或重排序；增加Enter保存及失焦清空的模拟API回归验证。 |
| **1.27** | 消除主要只读接口逐商品读库，改为请求内单快照/ID Map；Set/散件渐进渲染、详情缩略预览、异步解码与并发GET合并；优化滚动快照存储，补充合成性能和浏览器回归验证。 |
