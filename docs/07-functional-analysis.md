# 功能场景与代码质量深度分析报告

> 生成日期：2026-04-24 | 分支：main (d8064000)

---

## 目录

1. [核心场景执行链路](#1-核心场景执行链路)
2. [Store 架构与状态管理](#2-store-架构与状态管理)
3. [组件架构与复用性](#3-组件架构与复用性)
4. [渲染性能分析](#4-渲染性能分析)
5. [API 层与网络架构](#5-api-层与网络架构)
6. [工具函数复用性](#6-工具函数复用性)
7. [高级功能场景分析](#7-高级功能场景分析)
8. [安全性审计](#8-安全性审计)
9. [问题清单与优先级](#9-问题清单与优先级)
10. [改进路线图](#10-改进路线图)

---

## 1. 核心场景执行链路

### 1.1 场景一：用户发送聊天消息

**完整调用链：**

```
用户输入 → textarea.onChange → _Chat.onInput()
                                  ↓
用户提交 → onInputKeyDown / 按钮 → _Chat.doSubmit(userInput)
                                  ↓
          chatStore.onUserInput(content, images)        [store/chat.ts]
                                  ↓
          actions.onUserInput(content, images)           [store/chat-actions.ts]
            ├─ fillTemplateWith(content, modelConfig)    — 注入 {{time}}, {{lang}}
            ├─ createMessage({ role: "user" })           — 构建用户消息
            ├─ createMessage({ role: "assistant", streaming: true })
            ├─ getMessagesWithMemory()                   — 组装上下文窗口
            │    ├─ 系统提示词 (mask.context)
            │    ├─ MCP 工具定义 (如启用)
            │    ├─ 长期记忆 (session.memoryPrompt)
            │    └─ 最近消息 (token 预算内反向迭代)
            └─ api.llm.chat({ messages, stream: true })
                                  ↓
          BaseOpenAICompatibleApi.chat()                  [client/platforms/base.ts]
            ├─ buildMessages() — 预处理图片、剥离 <think>
            ├─ buildPayload() — 构造请求参数
            └─ streamWithThink()                          [utils/chat.ts]
                 ├─ fetchEventSource(chatPath, ...)       — SSE 连接
                 ├─ animateResponseText() via rAF         — 打字机动画
                 └─ parseSSE() per chunk                  — 解析每个 SSE 块
                                  ↓
          服务端路由: /api/{provider}/{...path}            [api/[provider]/route.ts]
            ├─ auth(req, provider)                        [api/auth.ts]
            ├─ requestOpenai(req, authResult)              [api/common.ts]
            │    ├─ resolveAuthHeaderValue()               — 3 级密钥优先级
            │    ├─ fetchWithRetry(url, opts)              — 指数退避重试
            │    └─ wrapWithHeartbeat() (可选)             — SSE 心跳防超时
            └─ Response → 直传回客户端
                                  ↓
          回调链:
            ├─ onUpdate(msg)    → 更新 botMessage.content → 触发重渲染
            ├─ onFinish(msg)    → streaming=false → onNewMessage()
            │    ├─ updateStat()
            │    ├─ checkMcpJson()    — 检测 MCP 工具调用
            │    └─ summarizeSession() — 条件触发摘要
            └─ onError(err)     → 标记 isError → 显示错误
```

**⚠️ 发现的问题：**

| # | 问题 | 影响 |
|---|------|------|
| 1 | `onUpdate` 每次 SSE chunk 调用 `session.messages.concat()` — O(n) 数组拷贝 | 长对话(数百条消息)下 GC 压力大 |
| 2 | `animateResponseText()` 通过 `requestAnimationFrame` 持续轮询 `remainText` | 流空闲时浪费 CPU，文本比实际到达更慢 |
| 3 | SSE 每条消息解析两次 JSON（一次提取 usage，一次在 parseSSE） | 冗余计算 |
| 4 | 用户在流式响应期间切换会话 → `getMessagesWithMemory()` 可能读取错误会话 | 上下文混淆风险 |

### 1.2 场景二：会话管理

| 操作 | 入口 | 调用链 | 关键行为 |
|------|------|--------|----------|
| 新建会话 | 侧边栏 "+" / `/new` 命令 | `chatStore.newSession(mask?)` → `createEmptySession()` → `set({ sessions: [new, ...old] })` | Mask 配置合并到新会话 |
| 切换会话 | 侧边栏点击 | `chatStore.selectSession(index)` → `set({ currentSessionIndex })` | `_Chat` 以 `key={session.id}` 重新挂载 |
| 删除会话 | 侧边栏滑动删除 | `chatStore.deleteSession()` → splice + adjust index → `showToast()` with undo | 5 秒内可撤销 |
| 复制会话 | `/fork` 命令 | `chatStore.forkSession()` → 深拷贝消息 → 新会话插入 | ⚠️ `mask.context` 浅拷贝，共享引用 |

**⚠️ forkSession 浅拷贝 bug**：`mask.context` 数组在 fork 时仅做浅拷贝，修改 fork 会话的 context 会同时污染原会话。

### 1.3 场景三：SSE 流式响应

```
客户端                                    服务端
  │                                         │
  │  POST /api/openai/chat/completions      │
  │ ──────────────────────────────────────→  │
  │         (X-Stream-Heartbeat: 1)         │
  │                                         │
  │  ← SSE: data: {"choices":[...]}         │
  │  ← SSE: data: {"choices":[...]}         │
  │  ← SSE: :heartbeat (每15秒)             │
  │  ← SSE: data: [DONE]                   │
  │                                         │
  │  animateResponseText():                 │
  │  remainText 缓冲 → rAF 每帧释放 1/60   │
  │  → onUpdate() → Zustand set()          │
  │  → React 重渲染消息列表                  │
```

**工具调用递归机制**：当 LLM 返回 `tool_calls` 时，`streamWithThink()` 的 `finish()` 会检测到待执行工具 → 执行工具函数 → 将结果拼入 messages → **递归调用** `chatApi()` 继续对话。这是正确的实现，但无递归深度限制。

---

## 2. Store 架构与状态管理

### 2.1 持久化层 — `createPersistStore`

所有 9 个 Store 使用 `createPersistStore`（[utils/store.ts](app/utils/store.ts)）封装：
- 底层存储：IndexedDB（`idb-keyval`），失败时回退 localStorage
- 水合守卫：`_hasHydrated` 防止未水合状态覆写持久数据
- `update()` 方法：**每次调用 `deepClone(get())`** — 对含大量消息的 chat store 是 O(n) 操作

### 2.2 Store 依赖图

```
useChatStore ──→ useAppConfig.getState()
     │
     └──→ chat-actions ──→ useAppConfig.getState()
              │            useAccessStore.getState()
              │            usePluginStore.getState()
              └──→ ClientApi ──→ useAccessStore.getState()

useSyncStore ──→ getLocalAppState() ──→ 读取全部 store

useMaskStore ──→ useAppConfig.getState() (创建空 mask 时)
useSdStore   ──→ useAccessStore.getState()
usePluginStore ──→ useAccessStore.getState()
```

跨 Store 访问全部使用 `useXxxStore.getState()`（同步快照），避免了循环订阅。但意味着读取时机决定数据新鲜度。

### 2.3 🔴 不可变性违规（关键问题）

多个 Store 采用"**原地修改再 set**"模式，Zustand 浅比较可能检测不到变化：

| Store | 文件 | 违规位置 | 描述 |
|-------|------|----------|------|
| `useMaskStore` | [mask.ts](app/store/mask.ts) L60-68 | `create()`, `updateMask()`, `delete()` | `get().masks` 引用不变，直接修改对象属性后 `set` |
| `usePromptStore` | [prompt.ts](app/store/prompt.ts) L61-71 | `add()`, `remove()` | 直接修改 `get().prompts` 数组 |
| `usePluginStore` | [plugin.ts](app/store/plugin.ts) | `create()`, `updatePlugin()` | 同上模式 |
| `useChatStore` | [chat.ts](app/store/chat.ts) L250 | `updateTargetSession()` | `sessions` 数组引用不变，内部 session 原地修改 |
| `useSdStore` | [sd.ts](app/store/sd.ts) | `updateDraw()` | `draw[index]` 原地替换，无新数组引用 |

**影响**：下游组件的 `React.memo` / `useSelector` 浅比较可能失效，导致状态更新不触发重渲染，或产生陈旧闭包。

### 2.4 `update()` 深拷贝性能问题

```typescript
// utils/store.ts L61-62
update(updater) {
  const state = deepClone(get());  // ← 整个 store 深拷贝
  updater(state);
  set({ ...state });
}
```

Chat Store 可能包含数百条会话、每条数十到数百消息（含图片 base64）。深拷贝成本在 MB 级别，每次 `config.update()` 调用都会触发。

### 2.5 Chat 数据迁移时序风险

[chat-migrations.ts](app/store/chat-migrations.ts) 在迁移逻辑中调用 `useAppConfig.getState()`。由于所有 Store 使用 IndexedDB 异步水合，config store 的水合可能晚于 chat store，导致迁移读到默认配置而非用户配置。

---

## 3. 组件架构与复用性

### 3.1 真正可复用的组件

| 组件 | 文件 | 复用场景 |
|------|------|----------|
| `List` / `ListItem` | [ui-lib.tsx](app/components/ui-lib.tsx) | 设置页、面具配置、插件配置 |
| `Modal` / `showConfirm` | [ui-lib-modal.tsx](app/components/ui-lib-modal.tsx) | 全局弹窗 |
| `IconButton` | [button.tsx](app/components/button.tsx) | 全局按钮 |
| `Popover` / `Select` / `Selector` | [ui-lib.tsx](app/components/ui-lib.tsx) | 通用选择器 |
| `Avatar` | [emoji.tsx](app/components/emoji.tsx) | 会话列表、消息项 |
| `MarkdownContent` | [markdown.tsx](app/components/markdown.tsx) | 消息渲染、Artifacts |
| Sidebar 布局壳 | [sidebar.tsx](app/components/sidebar.tsx) | `SideBarContainer/Header/Body/Tail` 用于 SD 侧边栏 |

### 3.2 紧耦合组件

| 组件 | 问题 |
|------|------|
| `ChatActions` | 接收 13 个 props + 内部订阅 3 个 Store，API 契约不清晰 |
| `PreCode` / `CustomCode` (markdown.tsx) | 内部直接 `useChatStore()` + `useAppConfig()` — 纯渲染组件不应依赖业务 Store |
| `MaskConfig` | 硬编码为 `Mask` 类型，直接读取 `useAppConfig()` |
| `ChatItem` | 绑定 `ChatSession` 类型 + DnD 库 + 路由跳转 |

### 3.3 重复模式

| 模式 | 位置 | 描述 |
|------|------|------|
| 模型配置编辑 | `MaskConfig` + `SessionConfigModel` | 都包裹 `ModelConfigList`，回调模式重复 |
| 导航发现入口 | `sidebar.tsx` DISCOVERY + `ChatActions` 内联导航 | 路由目标列表重复维护 |
| MCP 状态检查 | `SideBar` L237 + `MCPAction` L156 | 独立调用 `isMcpEnabled()` + `getAvailableClientsCount()` |

### 3.4 Props 传递 vs Store 访问

```
推荐模式 ✅:  ChatMessageItem ← 全部 props 传入 → React.memo 有效
推荐模式 ✅:  ChatHeader      ← 全部 props 传入 → React.memo 有效
混合模式 ⚠️:  ChatActions     ← 部分 props + 内部 3 store 订阅 → memo 失效
反模式 ❌:    PreCode         ← 纯渲染组件内部订阅全局 store → 级联重渲染
反模式 ❌:    ChatList        ← selector + 全量订阅混用 → selector 优化被抵消
```

---

## 4. 渲染性能分析

### 4.1 Store 订阅热力图

| 组件 | 订阅的 Store | 使用 Selector? | 重渲染频率 |
|------|-------------|---------------|-----------|
| `_Chat` | chat, config, access, prompt | ❌ 无 | 🔴 极高（每 token） |
| `ChatList` | chat (selector) + chat (全量) | 🟡 被全量抵消 | 🔴 极高 |
| `ChatActions` | config, chat, plugin | ❌ 无 | 🔴 极高 |
| `SideBar` | config, chat | ❌ 无 | 🟡 中等 |
| `PreCode` (×N) | chat, config | ❌ 无 | 🔴 极高（每消息×每代码块） |
| `Settings` | config, update, access, prompt | ❌ 无 | 🟢 低 |
| `ChatMessageItem` | 无（纯 props） | N/A | 🟢 低（memo 有效） |

### 4.2 🔴 关键性能瓶颈

#### 4.2.1 Markdown 内代码块的 Store 订阅

```
消息列表渲染时：
  每条消息 → MarkdownContent → rehype → PreCode / CustomCode
                                              ↓
                                   useChatStore() — 订阅全量
                                   useAppConfig() — 订阅全量
```

**影响**：假设可视区域有 10 条消息，每条平均 2 个代码块。流式响应期间，**每个 SSE token 触发 20 个代码块组件重渲染**。这些组件仅需 `enableArtifacts` 和 `enableCodeFold` 两个布尔值。

**修复方案**：通过 props 传入或使用窄 selector：
```typescript
const enableArtifacts = useChatStore(s => s.currentSession().mask.enableArtifacts);
```

#### 4.2.2 ChatList 双重订阅

```typescript
// chat-list.tsx
const [sessions, selectedIndex, ...] = useChatStore(
  (state) => [state.sessions, state.currentSessionIndex, ...]  // ← selector
);
const chatStore = useChatStore(); // ← 全量订阅，抵消 selector 优化
```

#### 4.2.3 流式响应的 O(n) 数组拷贝

每次 `onUpdate` → `updateTargetSession` → `session.messages = session.messages.concat()`

对于 500 条消息的会话，每秒约 50-100 次 SSE chunk × O(500) 数组拷贝 = 约 25,000-50,000 次对象引用操作/秒。

#### 4.2.4 `collectModelTable()` 未缓存

[utils/model.ts](app/utils/model.ts) 的 `collectModelTable()` 每次调用都重新解析 `customModels` 字符串、遍历全部模型。模型选择器、ChatActions、Settings 等多处调用，无任何缓存。

### 4.3 Bundle 体积关注点

| 项目 | 状态 | 说明 |
|------|------|------|
| `js-tiktoken` (~2MB BPE) | ✅ 动态 import | 正确代码分割 |
| `emoji-picker-react` | ✅ `optimizePackageImports` | 已配置 |
| `mermaid` (~1.5MB) | ❌ 未优化 | 不在 `optimizePackageImports` 中 |
| Edge TTS Node 垫片 (Buffer/crypto/stream) | ❌ 客户端冗余 | 约 50-100KB 额外体积 |
| `export` 模式 `maxChunks: 1` | ⚠️ 禁用代码分割 | Tauri/CF Pages 部署用，所有代码打入单 chunk |

---

## 5. API 层与网络架构

### 5.1 服务端路由分层

```
/api/[provider]/[...path]
  ├─ OpenAI/Azure/Stability → openaiHandler()
  │    ├─ auth() — 验证 access code / API key
  │    ├─ 路径白名单检查
  │    └─ requestOpenai() → fetchWithRetry() → 上游 LLM
  │
  ├─ 其他提供商 → proxyHandler()
  │    └─ 通用 CORS 代理
  │
  ├─ /api/image-gen — Node.js 运行时（60s 超时，绕过 Edge 25s 限制）
  ├─ /api/image-edit — 同上
  ├─ /api/model-info — Node.js 运行时（内存缓存模型信息）
  └─ /api/config    — 客户端配置（5分钟缓存）
```

**设计亮点**：
- `fetchWithRetry()` 指数退避 + 抖动，正确跳过流式响应和取消信号的重试
- SSE 心跳机制防止 Cloudflare 100s 代理超时
- 图片生成路由使用 Node.js 运行时绕过 Edge 超时限制
- `resolveAuthHeaderValue()` 三级密钥优先级清晰

**问题**：
- Azure 部署名称解析使用 `split("deployments/")` — 脆弱的字符串操作
- `DEFAULT_API_TIMEOUT_MS = 10 分钟` 过于宽松，3 次重试理论最长 30 分钟
- 模型信息缓存无 TTL，一旦加载永不刷新

### 5.2 客户端 API 层

```
ClientApi (工厂)
  └─ getClientApi(provider) → ChatGPTApi | RAGFlowApi
       │
       ├─ BaseOpenAICompatibleApi   ← 模板方法模式（好的抽象）
       │    ├─ getProviderConfig()  ← 子类提供
       │    ├─ buildMessages()
       │    ├─ buildPayload()
       │    └─ chat() → streamWithThink()
       │
       └─ ChatGPTApi.chat()         ← ⚠️ 完全覆写基类 chat()（200+ 行）
            └─ 独立实现图片生成、Azure 路径、推理模型等
```

**架构问题**：`ChatGPTApi.chat()` 完全覆写了 `BaseOpenAICompatibleApi.chat()`，绕过了模板方法模式。基类的抽象对 OpenAI 本身无效——讽刺的是 OpenAI 适配器反而是最不符合基类设计的。

### 5.3 网络请求特征

| 模式 | 实现 | 评价 |
|------|------|------|
| 重试退避 | `fetchWithRetry()` | ✅ 指数退避 + 抖动 |
| 请求去重 | 服务端 `fetchPromise` (model-info) | 🟡 仅服务端，客户端无 |
| 配置缓存 | `Cache-Control: max-age=300` | ✅ 合理 |
| SSE 心跳 | `wrapWithHeartbeat()` | ✅ 优秀设计 |
| 超时处理 | 双重超时（base.ts + streamWithThink） | ⚠️ 流式请求存在两个竞争超时 |

---

## 6. 工具函数复用性

### 6.1 复用性矩阵

| 模块 | 被引用次数 | 复用评价 | 问题 |
|------|-----------|----------|------|
| `utils/message.ts` | 26+ | ✅ 高复用 | 无 |
| `utils/responsive.ts` | 15+ | ✅ 高复用 | 无 |
| `utils/toast.ts` | 30+ | ✅ 高复用 | delegate 模式正确解耦 |
| `utils/platform.ts` | 10+ | ✅ 中等复用 | Tauri 条件分支清晰 |
| `utils/model-detection.ts` | 8+ | ✅ 中等复用 | 字符串启发式需持续维护 |
| `utils/chat.ts` | 5 | 🟡 低复用（太大） | 540 行含流处理+图片处理，应继续拆分 |
| `utils/model.ts` | 8+ | 🟡 中等 | `collectModelTable()` 未缓存 |
| `utils/tiktoken.ts` | 3 | ✅ 设计良好 | 惰性加载 + 降级估算 |
| `utils/store.ts` | 9 | ✅ 核心基础设施 | `deepClone` 性能问题 |
| `utils/edge-tts.ts` | 1 | ❌ 无复用 | Node 垫片污染客户端 bundle |
| `utils/token-calc.ts` | 2 | 🟡 | 与 chat-actions 逻辑重复 |

### 6.2 模块级单例问题

| 单例 | 文件 | 风险 |
|------|------|------|
| `ttsPlayer` | [chat-tts.ts](app/components/chat-tts.ts) | `stop()` 关闭 AudioContext 后不可恢复 |
| `imageCaches` | [utils/chat.ts](app/utils/chat.ts) L110 | 无界增长内存泄漏 |
| `FunctionToolService` | [plugin.ts](app/store/plugin.ts) | 全局可变单例，非 React 友好 |
| `clientsMap` | [mcp/actions.ts](app/mcp/actions.ts) | 服务端内存，serverless 不持久 |

---

## 7. 高级功能场景分析

### 7.1 Stable Diffusion 图片生成

```
SdSidebar (参数面板)
  → sdStore.sendTask(data)
    → stabilityRequestCall(item)
      → fetch(POST) → Stability API
        → 成功: cacheBase64Image() → updateDraw()
        → 失败: updateDraw({ status: "error" })
```

| 问题 | 严重性 | 描述 |
|------|--------|------|
| 无请求取消 | 🟡 | 无 AbortController，离开页面后请求仍在跑 |
| JSON 解析不安全 | 🟡 | 非 JSON 响应（如 500 HTML）会抛未捕获异常 |
| `getNextId()` 冗余 | ⚪ | 每个任务调用 2-3 次，但 ID 用 nanoid，counter 无用 |
| 无速率限制 | 🟡 | 快速多次提交会触发并行请求 |

### 7.2 MCP（Model Context Protocol）

```
初始化: Home useEffect → initializeMcpSystem()
  → 读取 mcp_config.json → 启动 StdioClientTransport 子进程
  → clientsMap 缓存在服务端内存

聊天集成:
  chat-actions → 注入 MCP 工具定义到系统提示
  → LLM 返回 ```json:mcp:clientId 代码块
  → checkMcpJson() 正则解析
  → executeMcpAction() 服务端动作
  → 结果作为用户消息喂回 LLM
```

| 问题 | 严重性 | 描述 |
|------|--------|------|
| **Serverless 不兼容** | 🔴 | `clientsMap` 在内存，Vercel 冷启动丢失全部状态 |
| **文件系统依赖** | 🔴 | `mcp_config.json` 在 Vercel 是只读/临时的 |
| **MCP 响应无验证** | 🔴 | LLM 输出直接 `JSON.parse` → `executeMcpAction`，存在注入风险 |
| 正则解析脆弱 | 🟡 | 依赖 LLM 输出精确的 markdown 格式 |
| 1秒轮询开销 | 🟡 | `useMcpServerManager` 每秒轮询 `getClientsStatus()` |
| 子进程清理 | 🟡 | 服务端异常退出时 stdio 子进程不会被回收 |

### 7.3 插件系统

```
usePluginStore → OpenAPIClientAxios → 解析 YAML → FunctionToolItem[]
  → getAsTools() → 注入到 LLM 工具调用
```

| 问题 | 严重性 | 描述 |
|------|--------|------|
| 错误吞没 | 🟡 | `api.initSync()` 的 catch 完全静默 |
| Auth token 明文存储 | 🟡 | localStorage 中无加密 |
| DALL-E 3 回退行为 | ⚠️ | 无特定插件 token 时静默使用 openaiApiKey |
| 5+ 处 `@ts-ignore` | 🟡 | 类型系统被绕过 |
| YAML 无安全 schema | 🟡 | `yaml.load()` 未限制类型 |

### 7.4 同步与导出

```
同步流程: useSyncStore.sync()
  → createSyncClient(provider) → WebDAV / Upstash
  → getLocalAppState() → 序列化全部 store
  → 远端 merge → mergeAppState() → setLocalAppState()
```

| 问题 | 严重性 | 描述 |
|------|--------|------|
| **🔴 合并 Bug** | 🔴 | `remoteUpdateTime = localState.lastUpdateTime` 应为 `remoteState`，导致远端永远被视为更新 |
| 无冲突解决 UI | 🟡 | 自动 last-write-wins，用户无法审查 |
| Upstash 写入非原子 | 🟡 | chunk 中断会损坏备份 |
| 数据未加密 | 🟡 | 明文存储含 API 密钥 |
| WebDAV check() 过于宽松 | ⚪ | 404 也视为成功 |

### 7.5 实时语音聊天

| 问题 | 严重性 | 描述 |
|------|--------|------|
| **API Key 暴露** | 🔴 | 客户端直连 WebSocket，API key 在浏览器可见 |
| 无上下文注入 | 🟡 | 实时会话无历史消息，与主聊天完全隔离 |
| Audio blob 非空断言 | 🟡 | `uploadImage(blob!)` 可能 undefined |
| 硬编码模型列表 | 🟡 | 只有 `gpt-4o-realtime-preview-2024-10-01` |

### 7.6 TTS 语音合成

| 问题 | 严重性 | 描述 |
|------|--------|------|
| AudioContext 关闭不可恢复 | 🟡 | `stop()` 调用 `close()` 后下次 `play()` 崩溃 |
| `require('markdown-to-txt')` | ⚪ | CJS require 在 ESM 中，破坏 tree-shaking |
| 无流式播放 | 🟡 | 整段音频下载完才开始播放 |
| Edge TTS WebSocket 无清理 | 🟡 | 连接可能泄漏 |
| 无并发语音控制 | 🟡 | 加载中再次调用不会取消进行中的请求 |

### 7.7 Artifacts

| 问题 | 严重性 | 描述 |
|------|--------|------|
| 无 CSP | 🟡 | iframe 沙箱内可加载外部脚本/图片 |
| 无上传大小限制 | 🟡 | 大 artifact 可能超出服务端限制 |

### 7.8 Mask/模板系统

| 问题 | 严重性 | 描述 |
|------|--------|------|
| `search()` 是空操作 | 🟡 | 返回全部 mask，完全忽略搜索文本 |
| 内建 mask 加载竞态 | 🟡 | 模块级 `fetch("/masks.json")` 无加载状态 |
| 混合 ID 方案 | ⚪ | 内建用数字 100000+，用户用 nanoid 字符串 |

---

## 8. 安全性审计

### 8.1 认证

| 项目 | 状态 | 说明 |
|------|------|------|
| Access Code 哈希 | ⚠️ | 使用 MD5（`spark-md5`）— 已被密码学破解 |
| API Key 传输 | ✅ | HTTPS + Authorization header |
| API Key 存储 | 🟡 | 客户端 localStorage/IndexedDB 明文 |
| 服务端密钥隔离 | ✅ | `getServerSideConfig()` 不暴露给客户端 |
| 同步数据加密 | ❌ | WebDAV/Upstash 明文存储 |

### 8.2 输入验证

| 风险 | 位置 | 状态 |
|------|------|------|
| MCP 工具调用注入 | chat-actions → executeMcpAction | ❌ 无 schema 验证 |
| YAML 安全加载 | plugin.ts yaml.load() | ❌ 无 safe schema |
| 路径白名单 | api/openai.ts | ✅ OpenaiPath 枚举 |
| 代理路径验证 | api/proxy.ts | ✅ URL 合法性检查 |

### 8.3 数据暴露

| 风险 | 严重性 | 描述 |
|------|--------|------|
| 实时语音 API Key | 🔴 | 客户端 WebSocket 直连，key 在浏览器 |
| 日志泄露 | 🟡 | 客户端 `console.log` 绕过 logger 的密钥掩码 |
| 插件 auth token | 🟡 | 明文 localStorage |

---

## 9. 问题清单与优先级

### 🔴 P0 — 必须修复

| # | 问题 | 位置 | 类型 |
|---|------|------|------|
| 1 | `PreCode`/`CustomCode` 订阅全量 store → 流式响应期间 N×M 重渲染 | markdown.tsx L109, L207 | 性能 |
| 2 | 同步合并 bug：`remoteUpdateTime = localState.lastUpdateTime` | utils/sync.ts L156 | 正确性 |
| 3 | Store 不可变性违规（mask, prompt, plugin, chat, sd） | 多文件 | 正确性 |
| 4 | 实时语音 API Key 暴露在客户端 | realtime-chat.tsx | 安全 |
| 5 | MCP 工具调用无 schema 验证 | chat-actions.ts checkMcpJson | 安全 |

### 🟡 P1 — 高优先级

| # | 问题 | 位置 | 类型 |
|---|------|------|------|
| 6 | `deepClone(get())` 每次 update — O(n) 对大 store | utils/store.ts L62 | 性能 |
| 7 | 流式 `messages.concat()` 每 token — O(n) | chat-actions.ts onUpdate | 性能 |
| 8 | ChatList 双重 store 订阅抵消 selector | chat-list.tsx L106-114 | 性能 |
| 9 | MD5 用于 access code 哈希 | api/auth.ts L3 | 安全 |
| 10 | `imageCaches` 无界增长内存泄漏 | utils/chat.ts L110 | 性能 |
| 11 | `forkSession()` mask.context 浅拷贝 | store/chat.ts L59-68 | 正确性 |
| 12 | IndexedDB 全量序列化每次 state 变更 | indexedDB-storage.ts | 性能 |

### 🟡 P2 — 中优先级

| # | 问题 | 位置 | 类型 |
|---|------|------|------|
| 13 | `collectModelTable()` 未缓存 | utils/model.ts | 性能 |
| 14 | `animateResponseText` rAF 空闲浪费 CPU | utils/chat.ts | 性能 |
| 15 | SSE 消息双重 JSON 解析 | utils/chat.ts | 性能 |
| 16 | OpenAI `chat()` 覆写基类 — 模板方法失效 | platforms/openai.ts L440 | 架构 |
| 17 | `mask.search()` 返回全量 — 搜索无效 | store/mask.ts L106 | 功能 |
| 18 | MCP serverless 不兼容 | mcp/actions.ts | 架构 |
| 19 | Edge TTS Node 垫片膨胀客户端 bundle | utils/edge-tts.ts | 体积 |
| 20 | `mermaid` 未配置 `optimizePackageImports` | next.config.mjs | 体积 |
| 21 | TTS AudioContext 关闭不可恢复 | chat-tts.ts → audio.ts | 正确性 |

### ⚪ P3 — 低优先级

| # | 问题 | 位置 | 类型 |
|---|------|------|------|
| 22 | 模型信息缓存无 TTL | api/model-info/cache.ts | 正确性 |
| 23 | 客户端 console.log 绕过 logger | 多文件 | 一致性 |
| 24 | Chat 迁移读 config 时序风险 | chat-migrations.ts | 正确性 |
| 25 | 工具调用递归无深度限制 | utils/chat.ts streamWithThink | 安全 |
| 26 | `token-calc.ts` 与 `chat-actions` 逻辑重复 | utils/token-calc.ts | 维护性 |
| 27 | SD `getNextId()` 冗余调用 | store/sd.ts | 代码质量 |

---

## 10. 改进路线图

### Sprint F — 性能关键修复

| 序号 | 任务 | 涉及文件 | 预期收益 | 状态 |
|------|------|----------|----------|------|
| F-01 | `PreCode`/`CustomCode` 改为 props 传入或窄 selector | markdown.tsx | 流式响应重渲染降低 80%+ | ✅ 已完成 |
| F-02 | 修复 sync 合并 bug（`remoteState.lastUpdateTime`） | utils/sync.ts L156 | 修复数据同步覆写问题 | ✅ 已完成 |
| F-03 | Store 不可变性修复（mask, prompt, plugin, sd） | 4 个 store 文件 | 消除状态一致性隐患 | ✅ 已完成 |
| F-04 | `update()` 改为浅合并替代 deepClone | utils/store.ts | config update 性能提升 10x+ | ✅ 已完成 |
| F-05 | ChatList 移除全量 store 订阅 | chat-list.tsx | 列表重渲染降低 | ✅ 已完成 |

### Sprint G — 安全与正确性

| 序号 | 任务 | 涉及文件 | 预期收益 |
|------|------|----------|----------|
| G-01 | MD5 → SHA-256 (access code hashing) | api/auth.ts | 安全性提升 |
| G-02 | 实时语音 API Key 走服务端代理 | realtime-chat/ | 消除密钥暴露 |
| G-03 | MCP 工具调用添加 JSON schema 验证 | chat-actions.ts, mcp/ | 防注入 |
| G-04 | `forkSession()` 深拷贝 mask.context | store/chat.ts | 修复共享引用 bug |
| G-05 | `mask.search()` 实现文本过滤 | store/mask.ts | 修复搜索功能 |

### Sprint H — 性能优化

| 序号 | 任务 | 涉及文件 | 预期收益 |
|------|------|----------|----------|
| H-01 | 流式 `onUpdate` 改用 `messages[index] = newMsg` 替代 concat | chat-actions.ts | O(n)→O(1) per token |
| H-02 | `imageCaches` 添加 LRU 上限（如 50 条） | utils/chat.ts | 防内存泄漏 |
| H-03 | `collectModelTable()` 添加 memo 缓存 | utils/model.ts | 减少重复解析 |
| H-04 | rAF 动画改为 `setTimeout` 按需触发 | utils/chat.ts | 减少空闲 CPU |
| H-05 | IndexedDB 写入添加 debounce（300ms） | indexedDB-storage.ts | 减少序列化频率 |
| H-06 | `mermaid` 加入 `optimizePackageImports` | next.config.mjs | bundle 体积优化 |

---

> **综合评估**：项目功能完整度高，场景覆盖广泛（聊天/图片生成/MCP/TTS/实时语音/同步/插件/Artifacts），但在流式响应性能、状态管理不可变性、安全边界方面存在需要优先修复的系统性问题。建议按 F→G→H 顺序依次推进。
