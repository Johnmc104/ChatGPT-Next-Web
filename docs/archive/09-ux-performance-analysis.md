# 用户体验、渲染性能与网页速度深度分析报告

> 生成日期：2026-04-25 | 分支：main (de5e2c4e)
> 基线：Sprint F/G/H 完成后
> 实施更新：2026-04-25 | Sprint I/J/K 已完成

---

## 目录

1. [分析方法论](#1-分析方法论)
2. [用户体验分析](#2-用户体验分析)
3. [渲染性能分析](#3-渲染性能分析)
4. [网页速度分析](#4-网页速度分析)
5. [问题清单与优先级](#5-问题清单与优先级)
6. [改进路线图](#6-改进路线图)

---

## 1. 分析方法论

本报告基于以下维度进行静态代码分析：

| 维度 | 分析方法 |
|------|----------|
| 用户体验 | 加载状态、交互反馈、可访问性、视觉一致性 |
| 渲染性能 | Zustand 订阅模式、React.memo 覆盖、re-render 链路、动画帧率 |
| 网页速度 | 首屏加载链路 (CSR)、代码分割、资源加载策略、Service Worker |

**Core Web Vitals 映射**：
- **LCP (Largest Contentful Paint)** → 首屏加载链路、字体加载策略
- **INP (Interaction to Next Paint)** → Store 订阅密度、动画帧率、布局抖动
- **CLS (Cumulative Layout Shift)** → 字体闪烁、骨架屏缺失、滚动行为

---

## 2. 用户体验分析

### 2.1 加载状态与感知性能

#### 2.1.1 初始加载链路

```
浏览器请求 HTML
  → Next.js 返回空壳 HTML (CSR)
  → 浏览器下载 JS bundle
  → React hydration
  → useHasHydrated() = false → 显示 <Loading /> 旋转图标
  → IndexedDB/localStorage 加载 → Zustand hydrate
  → useHasHydrated() = true → 显示应用 UI
  → useEffect → loadAsyncGoogleFont() → 请求 Google Fonts CSS
  → 字体下载完成 → 文字样式切换 (FOUT)
```

**问题**：

| # | 问题 | 影响 | 位置 |
|---|------|------|------|
| UX-01 | **无骨架屏** — 初始加载仅显示旋转 Loading 图标 | LCP 感知差 | home.tsx L279 |
| UX-02 | **Google Font 延迟加载** — 通过 JS useEffect 创建 `<link>` 标签 | FOUT (文字闪烁) | home.tsx L141-153 |
| UX-03 | **无 Suspense 边界** — 全应用零 `<Suspense>` 组件 | 无法流式渲染、无粒度化加载 | 全局 |
| UX-04 | **Service Worker 强制 reload** — 首次安装 SW 后 `location.reload()` 两次 | 首访用户页面闪烁 | serviceWorkerRegister.js L13,L20 |

#### 2.1.2 路由切换体验

```
用户点击导航 → HashRouter push → dynamic() import → <Loading /> → 组件渲染
```

| 状态 | 实现 | 评价 |
|------|------|------|
| 路由级代码分割 | ✅ 全部 9 个路由使用 `next/dynamic` | 优秀 |
| 过渡动画 | ✅ `slide-in` CSS 动画 (0.3s) | 合理 |
| 加载回退 | 🟡 统一 `<Loading noLogo />` 旋转图标 | 无骨架屏 |
| 路由预加载 | ❌ 无 prefetch/preload 策略 | 每次都冷加载 |

#### 2.1.3 流式响应体验

```
用户发送消息
  → 立即显示用户消息 ✅
  → 创建空 assistant 消息 (streaming: true)
  → SSE 开始 → animateResponseText() 60fps 动画
  → 每帧 ~1/60 文本追加 + onUpdate → store 更新 → UI 重渲染
  → 流结束 → remainText 一次性追加 → 最终渲染
```

| 状态 | 实现 | 评价 |
|------|------|------|
| 流式文字动画 | ✅ rAF 逐字追加 | 视觉平滑 |
| 自动滚动 | ✅ `useScrollToBottom` + rAF | 正常工作 |
| 停止按钮 | ✅ AbortController | 响应及时 |
| Markdown 渲染 | 🟡 每帧全量重解析 | 性能瓶颈 |
| 代码块高亮 | 🟡 rehype-highlight 每帧重运行 | 性能瓶颈 |

### 2.2 交互反馈

| 交互 | 反馈 | 评价 |
|------|------|------|
| 复制代码 | Toast 提示 | ✅ 即时 |
| 发送消息 | 消息立即出现 | ✅ 即时 |
| 删除会话 | 确认弹窗（移动端） | ✅ 安全 |
| 模型切换 | 下拉选择 | ✅ 流畅 |
| 侧边栏拖拽 | 20ms 节流 | ✅ 合理 |
| 面具搜索 | ✅ 已实现过滤 (G-05) | ✅ |
| 图片上传 | 粘贴/拖拽/按钮 | ✅ 多入口 |
| TTS 播放 | 🟡 整段下载后播放 | 延迟感知 |
| 导出对话 | 🟡 无进度指示 | 大对话导出时无反馈 |

### 2.3 可访问性

| 维度 | 状态 | 问题 |
|------|------|------|
| 键盘导航 | 🟡 部分支持 | 有快捷键但无 focus trap |
| 缩放支持 | ❌ 禁用 | `user-scalable=no` + `maximum-scale=1` |
| 屏幕阅读器 | ❌ 无支持 | 无 ARIA 标签、无 role 属性 |
| 颜色对比 | 🟡 未验证 | 暗色主题需评估 |
| 重复 viewport | ⚪ | layout.tsx 同时用 `Viewport` export 和 `<meta>` 标签 |

### 2.4 视觉一致性

| 维度 | 状态 | 详情 |
|------|------|------|
| CSS Modules | ✅ 21 个 `.module.scss` | 样式隔离良好 |
| 全局样式 | ⚠️ 3 个全局 SCSS | `globals.scss`、`markdown.scss`、`highlight.scss` 未隔离 |
| CSS 变量 | ✅ 主题色/尺寸用变量 | `--sidebar-width`、`--window-content-width` |
| 响应式断点 | ✅ 600px 移动端 | 单断点，简洁 |
| `transition: all` 泛滥 | ⚠️ 11 处 | 触发不必要的属性过渡，影响性能 |

---

## 3. 渲染性能分析

### 3.1 Store 订阅热力图（当前状态）

Sprint F 修复了 PreCode/CustomCode 和 ChatList。但系统中仍有大量全量订阅：

| 组件 | 订阅 Store | Selector? | 重渲染频率 | 修复状态 |
|------|-----------|----------|-----------|---------|
| `_Chat` | chatStore, appConfig | ❌ 全量 | 🔴 极高 | ❌ 未修复 |
| `ChatActions` | chatStore, appConfig, pluginStore | ❌ 全量 | 🔴 极高 | ❌ 未修复 |
| `SideBar` | chatStore ×2, appConfig | ❌ 全量 ×3 | 🟡 中等 | ❌ 未修复 |
| `ChatInput` | chatStore ×2 | ❌ 全量 | 🔴 高 | ❌ 未修复 |
| `ChatModals` | chatStore ×2 | ❌ 全量 | 🟡 按需 | ❌ 未修复 |
| `PreCode` (×N) | ~~chatStore, appConfig~~ | ✅ Context | 🟢 低 | ✅ F-01 |
| `CustomCode` (×N) | ~~chatStore, appConfig~~ | ✅ Context | 🟢 低 | ✅ F-01 |
| `ChatList` | chatStore (selector) | ✅ | 🟢 低 | ✅ F-05 |
| `ChatMessageItem` | 无（纯 props） | N/A | 🟢 极低 | ✅ 天然 |
| `ChatHeader` | 无（纯 props） | N/A | 🟢 极低 | ✅ 天然 |

**全量订阅统计**：**21+ 处** `useChatStore()` 裸调用（无 selector）分布在 16 个文件中。

### 3.2 流式响应渲染链路

```
SSE chunk 到达
  ↓
animateResponseText() [60fps rAF 循环]
  ↓ 每帧追加 ~1/60 文本
options.onUpdate(responseText, fetchText)
  ↓
chatStore.updateTargetSession() → set({ sessions: [...] })
  ↓ Zustand notify all subscribers
┌─────────────────────────────────────────┐
│ Re-render cascade (每帧):               │
│                                         │
│ _Chat (全量订阅)                         │
│   ├── ChatHeader (props → memo ✅)      │
│   ├── ChatMessages                      │
│   │   └── ChatMessageItem[] (memo ✅)   │
│   │       └── MarkdownContent (memo ✅) │
│   │           └── PreCode (context ✅)  │
│   ├── ChatActions (全量订阅 🔴)          │
│   ├── ChatInput (全量订阅 🔴)            │
│   └── ChatModals (全量订阅 🟡)           │
│                                         │
│ SideBar (全量订阅 ×2 🔴)                 │
│   └── ChatList (selector ✅)            │
└─────────────────────────────────────────┘
```

**每帧工作量估算**（10 条消息、2 代码块/消息）：
- 触发: 1 rAF × 1 store update × ~60fps = 60 次/秒
- _Chat 重渲染: 1 次 → reconciliation 扫描全部子树
- ChatActions 重渲染: 1 次（3 个 store 全量订阅）
- ChatInput 重渲染: 1 次
- SideBar 重渲染: 1 次
- ChatMessageItem: memo 有效，仅最后一条消息的 props 变了 → 1 次重渲染 ✅
- **PreCode/CustomCode: ✅ 已通过 Context 修复，不再级联**
- **总计: ~4-5 个组件树 × 60fps = ~240-300 次/秒组件重渲染**

### 3.3 关键渲染瓶颈

#### 3.3.1 🔴 animateResponseText 60fps 循环

**位置**: `utils/chat.ts` L293-318

```typescript
function animateResponseText() {
  if (remainText.length > 0) {
    const fetchCount = Math.max(1, Math.round(remainText.length / 60));
    responseText += fetchText;
    options.onUpdate?.(responseText, fetchText);  // → store update → re-render
  }
  requestAnimationFrame(animateResponseText);  // 60fps 无条件循环
}
animateResponseText(); // 立即启动，在 SSE 数据到达前就运行
```

**问题**：
1. rAF 在 SSE 到达前就启动，空转消耗 CPU
2. `remainText.length > 0` 时每帧都触发 store update → 全组件树重渲染
3. 60fps 对于文本追加过于激进 — 用户肉眼无法区分 30fps 和 60fps 的文字出现速度

#### 3.3.2 🔴 useScrollToBottom 无依赖 useEffect

**位置**: `hooks/useChatScroll.ts` L28-31

```typescript
useEffect(() => {
  if (autoScroll && !detach) {
    scrollDomToBottom();
  }
}); // ← 无依赖数组 — 每次 render 都执行
```

**问题**：每次 `_Chat` 重渲染（60fps）都会触发 `scrollDomToBottom()` → 又一个 rAF → 读取 `dom.scrollHeight`（强制布局计算）→ `dom.scrollTo()`。

**影响链**：60fps store update → _Chat re-render → useEffect run → rAF → forced layout → scroll。

#### 3.3.3 🔴 _Chat / ChatActions / SideBar 全量订阅

**位置**: 多文件

_Chat 组件（L103）:
```typescript
const chatStore = useChatStore();        // 全量
const config = useAppConfig();            // 全量
```

ChatActions（L203-206）:
```typescript
const config = useAppConfig();            // 全量
const chatStore = useChatStore();         // 全量
const pluginStore = usePluginStore();     // 全量
```

SideBar（L48, L238）:
```typescript
useChatStore();   // via useHotKey — 全量
useChatStore();   // 直接 — 全量（第二次）
useAppConfig();   // 全量
```

**组合影响**：流式期间任何 store 变更 → 同时触发 _Chat + ChatActions + ChatInput + SideBar + ChatModals 重渲染。

#### 3.3.4 🟡 useWindowSize 在 PreCode 中

**位置**: `markdown.tsx` L119

```typescript
export function PreCode(props: { children: any }) {
  const { height } = useWindowSize();  // 每个代码块独立订阅 resize
```

**影响**：10 条消息 × 2 代码块 = 20 个独立的 resize 订阅者。窗口 resize 时 20 个组件同时重渲染。

#### 3.3.5 🟡 transition: all 泛滥

**位置**: `chat.module.scss` (11 处)

```scss
transition: all ease 0.3s;  // L25, L78, L157, L280, L308, L358, L377, L384, L472, L537, L588
```

`transition: all` 包含 `width`、`height`、`margin`、`padding` 等会触发 layout 的属性。浏览器需要在每帧计算所有属性的过渡值，即使只需要 `opacity` 和 `transform`。

### 3.4 React.memo 覆盖率

| 组件 | memo? | 能否有效? | 建议 |
|------|-------|----------|------|
| `_Chat` (顶层) | ❌ | 🟡 有限（内部多 store 订阅） | 不适合 memo |
| `ChatActions` | ❌ | 🟡 有限 | 需先改 selector |
| `ChatInput` | ❌ | 🟡 有限 | 需先改 selector |
| `SideBar` | ❌ | 🟡 有限 | 需先改 selector |
| `ChatList` | ❌ (动态加载) | ✅ selector 已修复 | 可加 memo |
| `ChatMessageItem` | ✅ | ✅ 有效 | — |
| `ChatHeader` | ✅ | ✅ 有效 | — |
| `MarkdownContent` | ✅ | ✅ 有效 | — |
| `Mermaid` | ✅ | ✅ 有效 | — |
| `ChatAction` | ✅ | ✅ 有效 | — |

**结论**：关键渲染路径上的大组件（`_Chat`、`ChatActions`、`SideBar`）都没有 memo 且全量订阅 store，memo 在不改 selector 的前提下也无效。

---

## 4. 网页速度分析

### 4.1 首屏加载链路

```
t=0     浏览器请求 → Next.js 返回 HTML 壳 (CSR-only, "use client")
t=~50ms HTML 解析 → 发现 JS bundle link
t=~200ms JS 下载完成 (standalone: code-split / export: 单 chunk)
t=~400ms React mount → useHasHydrated = false → <Loading /> 旋转图标
t=~500ms IndexedDB 异步读取 → Zustand hydrate → useHasHydrated = true
t=~600ms 应用 UI 渲染 → FCP (First Contentful Paint)
t=~700ms useEffect → loadAsyncGoogleFont() → 请求 Google Fonts CSS
t=~900ms Google Fonts CSS 下载 → 字体文件请求
t=~1200ms 字体下载完成 → FOUT → LCP (Largest Contentful Paint)
```

**关键时间线问题**：

| 阶段 | 问题 | 影响的指标 |
|------|------|-----------|
| t=0~400ms | **纯 CSR** — 无 SSR/SSG 内容 | FCP 延迟 |
| t=400~500ms | **全屏 Loading 旋转** — 无骨架屏 | CLS, 感知性能 |
| t=600~700ms | **字体请求延迟** — 在 useEffect 中才发起 | FOUT, LCP |
| t=700~1200ms | **字体 FOUT** — 系统字体 → Google Font 切换 | CLS |

### 4.2 资源加载策略

| 资源类型 | 当前策略 | 评价 | 建议 |
|----------|---------|------|------|
| JS Bundle | `next/dynamic` 按路由分割 | ✅ 好 | — |
| Google Font | `useEffect` 运行时 `<link>` | ❌ 延迟 | `<link rel="preload">` 或 `next/font` |
| Tiktoken BPE | `preloadEncoder()` 后台加载 | ✅ 好 | — |
| Mermaid | 懒加载单例 | ✅ 好 | — |
| 图片 | 原生 `<img>` 无 lazy | ❌ 差 | `loading="lazy"` |
| SVG 图标 | @svgr/webpack 内联 | ✅ 零请求 | — |
| Service Worker | 仅文件缓存 | 🟡 不缓存应用资源 | 可选：precache 关键 JS |

### 4.3 Bundle 体积分析

| 模式 | 代码分割 | 图片优化 | 主要风险 |
|------|---------|---------|---------|
| standalone | ✅ 按路由分割 | ✅ next/image 可用 | 正常 |
| export | ❌ 单 chunk (`maxChunks: 1`) | ❌ `unoptimized: true` | 🔴 全量 bundle |

**export 模式风险**：Tauri 桌面端和 Cloudflare Pages 使用 export 模式，所有 JS 打入单文件，首屏加载包含 mermaid、emoji-picker、tiktoken 等全部依赖。

**重度依赖清单**：

| 包 | 估计解析体积 | 加载策略 | 评价 |
|----|------------|---------|------|
| mermaid | ~2.5 MB | 动态 import + optimizePackageImports | ✅ |
| emoji-picker-react | ~500 KB | optimizePackageImports | ✅ |
| js-tiktoken (BPE) | ~2 MB | 动态 import | ✅ |
| react-markdown + rehype-* + remark-* | ~300 KB | 静态 import | 🟡 全量打入 |
| html-to-image | ~100 KB | 静态 import | 🟡 仅导出功能用 |
| katex | ~700 KB | 静态 import (CSS + JS) | 🟡 全量打入 |

### 4.4 滚动性能

#### 滚动容器分析

| 容器 | 文件 | `will-change`? | `contain`? | 评价 |
|------|------|---------------|-----------|------|
| 消息列表 | chat.module.scss | ❌ | ❌ | 🔴 关键滚动区 |
| 侧边栏列表 | home.module.scss | ❌ | ❌ | 🟡 |
| 设置页面 | settings.module.scss | ❌ | ❌ | 🟡 |
| 面具列表 | mask.module.scss | ❌ | ❌ | 🟡 |
| Markdown 内容 | markdown.scss | ❌ | ❌ | 🟡 |

**全局特征**：20+ 个 `overflow: auto/scroll` 容器，零 GPU 合成提示。在移动端嵌套滚动容器中，浏览器需要在每帧做 hit-test 判断哪个容器应该滚动，缺少 `contain: layout` 会导致布局抖动。

### 4.5 Service Worker 策略

**当前实现**（`public/serviceWorker.js`）：
- 功能：仅代理 `/api/cache/*` 文件请求（图片/附件）
- 缓存策略：CacheStorage + LRU (cap 500, evict to 400)
- 应用资源缓存：❌ 无
- 离线支持：❌ 无
- 安装行为：`skipWaiting()` + `location.reload()` ← 可能导致首访闪烁

**问题**：
| # | 问题 | 影响 |
|---|------|------|
| SW-01 | 不缓存 JS/CSS/HTML 等应用资源 | 无法离线访问，重复访问无速度提升 |
| SW-02 | `location.reload()` 在 install + controllerchange 事件 | 首访用户可能经历 2 次页面刷新 |
| SW-03 | 无版本化缓存策略 | 文件缓存可能变陈旧 |

---

## 5. 问题清单与优先级

### 🔴 P0 — 关键问题（直接影响核心体验）

| # | 问题 | 类型 | 位置 | 影响 |
|---|------|------|------|------|
| P0-1 | **21+ 处 `useChatStore()` 全量订阅** | 渲染性能 | 16 个组件文件 | 流式时全组件树 60fps 重渲染 |
| P0-2 | **animateResponseText 60fps rAF 循环** | 渲染性能 | utils/chat.ts L293 | 空转 + 每帧 store update |
| P0-3 | **useScrollToBottom 无依赖 useEffect** | 渲染性能 | hooks/useChatScroll.ts L28 | 每次 render 强制布局计算 |

### 🟡 P1 — 高优先级（明显影响性能或体验）

| # | 问题 | 类型 | 位置 | 影响 |
|---|------|------|------|------|
| P1-1 | **无骨架屏/Suspense** | UX | home.tsx | 白屏→旋转→内容的 CLS |
| P1-2 | **Google Font 延迟加载** | 速度 | home.tsx L141 | FOUT 文字闪烁 |
| P1-3 | **图片无 lazy loading** | 速度 | image-preview.tsx, sd.tsx, ui-lib-modal.tsx | 不可见图片占用带宽 |
| P1-4 | **滚动容器无 GPU 合成** | 渲染性能 | 20+ SCSS 文件 | 移动端滚动卡顿 |
| P1-5 | **transition: all 泛滥** | 渲染性能 | chat.module.scss (11处) | 不必要的属性过渡计算 |
| P1-6 | **useWindowSize 在 PreCode 中** | 渲染性能 | markdown.tsx L119 | N 代码块 × resize 重渲染 |
| P1-7 | **SideBar 双重 chatStore 订阅** | 渲染性能 | sidebar.tsx L48, L238 | 每次 store 变更双重触发 |

### ⚪ P2 — 中优先级

| # | 问题 | 类型 | 位置 | 影响 |
|---|------|------|------|------|
| P2-1 | Service Worker 不缓存应用资源 | 速度 | serviceWorker.js | 无离线支持 |
| P2-2 | export 模式单 chunk | 速度 | next.config.mjs | 全量 bundle |
| P2-3 | 禁用缩放 (user-scalable=no) | 可访问性 | layout.tsx | 视障用户无法放大 |
| P2-4 | 重复 viewport 声明 | 规范 | layout.tsx | 两处 viewport 定义 |
| P2-5 | SW install 双重 reload | UX | serviceWorkerRegister.js | 首访闪烁 |
| P2-6 | 无 ARIA 标签 | 可访问性 | 全局 | 屏幕阅读器不可用 |
| P2-7 | katex CSS 全量静态导入 | 速度 | markdown.tsx L2 | ~700KB 无条件加载 |

---

## 6. 改进路线图

### Sprint I — 渲染性能关键修复 ✅ 已完成

| 序号 | 任务 | 涉及文件 | 预期收益 | 状态 |
|------|------|----------|----------|------|
| I-01 | `_Chat` 关键 store 订阅改为 selector | chat.tsx | 流式重渲染降低 60%+ | ✅ |
| I-02 | `ChatActions` 三个全量订阅改为 selector | chat-actions.tsx | 消除不必要重渲染 | ✅ |
| I-03 | `ChatInput` 全量订阅改为 selector | chat-input.tsx | 消除输入时不必要重渲染 | ✅ |
| I-04 | `SideBar` 移除双重订阅 + 改 selector | sidebar.tsx | 消除侧边栏冗余渲染 | ✅ |
| I-05 | `useScrollToBottom` useEffect 添加依赖数组 | hooks/useChatScroll.ts | 消除每帧强制布局 | ✅ |

**I-01 详细方案**：

`_Chat` 当前使用 `useChatStore()` 全量，实际需要的字段：
```typescript
// 当前 (全量订阅)
const chatStore = useChatStore();
const session = chatStore.currentSession();

// 建议 (窄 selector)
const [session, onUserInput, deleteMessage, ...] = useChatStore(s => [
  s.currentSession(),
  s.onUserInput,
  s.deleteMessage,
  // ... 仅列出实际使用的方法和属性
]);
```

注意：`_Chat` 依赖较多 store 方法（`onUserInput`、`deleteMessage`、`onNewTopic` 等），需要逐一审计使用点。方法引用是稳定的（不会触发重渲染），关键是避免订阅 `sessions` 数组的全量变更。

### Sprint J — 流式动画优化 ✅ 已完成（J-01, J-03）

| 序号 | 任务 | 涉及文件 | 预期收益 | 状态 |
|------|------|----------|----------|------|
| J-01 | animateResponseText 改为按需 setTimeout | utils/chat.ts | CPU 占用降低 50%+ | ✅ |
| J-02 | 流式 onUpdate 使用 index 赋值替代 concat | utils/chat.ts, chat-actions.ts | O(n)→O(1) per token | ⏳ 延后 |
| J-03 | PreCode 移除 useWindowSize 改为 CSS | markdown.tsx | 消除 N×resize 重渲染 | ✅ |

**J-01 详细方案**：

```typescript
// 当前: 无条件 60fps rAF
function animateResponseText() {
  if (remainText.length > 0) { /* ... */ }
  requestAnimationFrame(animateResponseText);
}
animateResponseText(); // 立即启动

// 建议: 按需 setTimeout，SSE 到达时才启动
let animTimer: number | null = null;
function scheduleAnimate() {
  if (animTimer !== null) return;
  animTimer = window.setTimeout(() => {
    animTimer = null;
    if (remainText.length > 0) {
      const fetchCount = Math.max(1, Math.round(remainText.length / 30));
      responseText += remainText.slice(0, fetchCount);
      remainText = remainText.slice(fetchCount);
      options.onUpdate?.(responseText, fetchText);
      if (remainText.length > 0) scheduleAnimate();
    }
  }, 33); // ~30fps — 用户无感知差异
}
// SSE onMessage 中调用 scheduleAnimate() 而非 animateResponseText()
```

### Sprint K — 网页速度与 UX 优化 ✅ 已完成（K-01, K-03~K-06）

| 序号 | 任务 | 涉及文件 | 预期收益 | 状态 |
|------|------|----------|----------|------|
| K-01 | Google Font 改为 `<link rel="preconnect">` | layout.tsx | 加速字体连接 | ✅ |
| K-02 | 图片添加 `loading="lazy"` | — | — | ⏭ 不适用（无 `<img>` 标签） |
| K-03 | 关键滚动容器添加 `will-change` + `contain` | chat.module.scss | 移动端滚动流畅 | ✅ |
| K-04 | `transition: all` 改为具体属性 | chat.module.scss (15处) | 减少过渡计算 | ✅ |
| K-05 | 修复 SW 安装双重 reload | serviceWorkerRegister.js | 消除首访闪烁 | ✅ |
| K-06 | 移除 `user-scalable=no` 重复 viewport | layout.tsx | 恢复缩放支持 | ✅ |

**K-01 详细方案**：

```typescript
// 方案 A: next/font (推荐 — standalone 模式)
// layout.tsx
import { Noto_Sans } from 'next/font/google';
const notoSans = Noto_Sans({ subsets: ['latin'], weight: ['300','400','700','900'] });

// 方案 B: <link rel="preconnect"> + <link rel="preload"> (export 模式)
// layout.tsx <head>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@300;400;700;900&display=swap" />
```

### Sprint L — 体验增强 ✅

| 序号 | 任务 | 涉及文件 | 预期收益 | 复杂度 | 状态 |
|------|------|----------|----------|--------|------|
| L-01 | 初始加载骨架屏 | home.tsx, home.module.scss | 感知加载速度提升 | 中 | ✅ SkeletonLoading 组件，模拟侧边栏+主区域布局，shimmer 动画 |
| L-02 | katex CSS 动态加载 | markdown.tsx, global.d.ts | 无数学公式时减少 ~200KB CSS | 中 | ✅ 检测数学内容 ($, \\[) 后按需 import("katex/dist/katex.min.css") |
| L-03 | html-to-image 动态导入 | exporter.tsx, exporter-image.tsx | 减少初始 bundle ~100KB | 低 | ✅ toBlob/toPng 改为 await import("html-to-image")，删除静态导入 |
| L-04 | SW precache 关键 JS/CSS | serviceWorker.js | 重复访问秒开 | 高 | ✅ /_next/static/ 资源 cache-first 策略，利用内容哈希文件名不变性 |
| L-05 | Markdown 增量渲染 | markdown.tsx | 流式时不全量重解析 | 高 | ✅ useDebouncedCallback 节流 60ms/maxWait 120ms，减少 ReactMarkdown 重渲染 ~5-10x |

### 实施优先级排序

```
Sprint I (渲染性能) ───→ Sprint J (流式优化) ───→ Sprint K (速度/UX) ───→ Sprint L (增强)
  I-05 (最简单)            J-03 (简单)              K-01~K-06 (全低)        L-01~L-05 (可选)
  I-04 (低)                J-01 (中)
  I-03 (低)                J-02 (高)
  I-01 (中)
  I-02 (中)
```

**建议执行顺序**：
1. 先做 Sprint I-05 + I-04 + I-03 — 低复杂度高收益
2. 然后 Sprint K (全部低复杂度) — 快速提升 Web Vitals
3. 再做 Sprint I-01 + I-02 — 中复杂度，需审计 store 使用
4. Sprint J-01 + J-03 — 流式优化
5. Sprint J-02 + L 系列 — 高复杂度，可选

---

## 附录 A: 完整 Store 订阅清单

### useChatStore() 裸调用（无 selector）

| 文件 | 行号 | 组件/函数 |
|------|------|----------|
| chat.tsx | 103, 812 | `_Chat` |
| chat-actions.tsx | 205 | `ChatActions` |
| chat-input.tsx | 28, 183 | `ChatInput` |
| chat-modals.tsx | 31, 103 | `ChatModals` |
| chat-images.ts | 9 | `usePasteHandler` |
| chat-keyboard-shortcuts.ts | 21 | `useChatKeyboardShortcuts` |
| sidebar.tsx | 48, 238 | `SideBar` |
| settings-sync.tsx | 232 | `SyncConfigDialog` |
| message-selector.tsx | 76 | `useMessageSelector` |
| search-chat.tsx | 21 | `SearchChat` |
| mask.tsx | 237 | `MaskPage` |
| new-chat.tsx | 78 | `NewChat` |
| exporter.tsx | 168 | `ExportMessageModal` |
| exporter-image.tsx | 34 | `ImageExporter` |
| settings-danger.tsx | 12 | `DangerItems` |
| realtime-chat.tsx | 36 | `RealtimeChat` |

### useAppConfig() 裸调用

| 文件 | 行号 | 组件/函数 |
|------|------|----------|
| chat.tsx | 105 | `_Chat` |
| chat-actions.tsx | 203 | `ChatActions` |
| sidebar.tsx | 237 | `SideBar` |
| home.tsx | 171 | `Screen` |
| settings.tsx | 多处 | `Settings` |
| mask.tsx | 多处 | `MaskPage` |
| model-config.tsx | 多处 | `ModelConfigList` |

## 附录 B: CSS 动画清单

### transition: all 实例

| 文件 | 行号 | 选择器 | 建议替换 |
|------|------|--------|---------|
| chat.module.scss | 25 | `.attach-image-mask` | `transition: opacity 0.2s ease` |
| chat.module.scss | 78 | `.text` | `transition: opacity 0.3s ease, max-width 0.3s ease` |
| chat.module.scss | 157 | `.chat-message-actions` | `transition: opacity 0.3s ease` |
| chat.module.scss | 280 | `.chat-message-user` | `transition: opacity 0.3s ease` |
| chat.module.scss | 308 | `.chat-message-container` | `transition: opacity 0.3s ease, transform 0.3s ease` |
| chat.module.scss | 358 | `.chat-input` | `transition: height 0.3s ease` |
| chat.module.scss | 377 | `.chat-input-panel-inner` | `transition: max-height 0.3s ease` |
| chat.module.scss | 384 | — | 同上 |
| chat.module.scss | 472 | — | 检查实际需求 |
| chat.module.scss | 537 | — | 检查实际需求 |
| chat.module.scss | 588 | — | 检查实际需求 |
