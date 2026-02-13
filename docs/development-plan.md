# NextChat 后续开发计划

> 制定日期：2026-02-13  
> 基于：[工程分析报告](project-analysis.md) 和 [社区需求 PRD](../prd.md)

---

## 开发原则

1. **稳定优先**：先修复系统性问题，再开发新功能
2. **渐进重构**：每次变更可控，不做大爆炸式重写
3. **测试保障**：新代码必须有测试覆盖
4. **社区驱动**：功能优先级参考 GitHub Issues 热度

---

## 第一阶段：基础加固（预计 2 周） ✅ 已完成

> 目标：解决系统性稳定问题，建立质量基线  
> **完成日期：2026-02-13**

### Sprint 1.1 — 认证与代理重构（P0） ✅

**背景**：近期 50%+ 的 fix 提交集中在 auth/proxy 逻辑，表明当前设计存在根本性问题。

**实际交付：**

| 任务 | 描述 | 状态 |
|------|------|------|
| 1.1.1 | 创建统一日志工具 `app/utils/logger.ts`：自动脱敏 API Key，按环境切换日志级别，支持 debug/info/warn/error | ✅ |
| 1.1.2 | 提取共享 URL 构建工具 `app/api/url-builder.ts`：`buildFetchUrl()`、`normalizeBaseUrl()`、`createTimeoutController()`、`buildUpstreamHeaders()`、`cleanResponseHeaders()`，消除 3 处重复代码 | ✅ |
| 1.1.3 | 重构 `auth.ts`：替换 console.log 为 logger，移除敏感数据泄露（不再打印 API Key 原文） | ✅ |
| 1.1.4 | 重构 `proxy.ts`：从 163 行精简为 ~80 行，统一使用共享工具 | ✅ |
| 1.1.5 | 重构 `common.ts` + `provider.ts`：统一 URL 构建、超时控制、响应清洗 | ✅ |

### Sprint 1.2 — console.log 清理与安全加固（P0） ✅

| 任务 | 描述 | 状态 |
|------|------|------|
| 1.2.1 | API 层全部 console.log 替换为 logger（涵盖 auth、proxy、common、provider、openai、azure、google、baidu、stability、tencent、webdav、upstash、model-info、artifacts、config/server） | ✅ |
| 1.2.2 | ESLint 添加 `no-console: ["warn", { "allow": ["warn", "error"] }]` 规则 | ✅ |
| 1.2.3 | CORS `Access-Control-Allow-Origin` 改为环境变量 `CORS_ALLOW_ORIGIN` 控制（默认 `*`） | ✅ |

### Sprint 1.3 — 测试基础设施（P0） ✅

| 任务 | 描述 | 状态 |
|------|------|------|
| 1.3.1 | `test/auth.test.ts`：认证模块 16 个测试用例，覆盖率 89% | ✅ |
| 1.3.2 | `test/url-builder.test.ts`：URL 构建工具 27 个测试用例，覆盖率 99% | ✅ |
| 1.3.3 | `test/logger.test.ts`：日志工具 12 个测试用例，覆盖率 98% | ✅ |
| 1.3.4 | Jest `collectCoverageFrom` + `test:ci --coverage` 配置 | ✅ |

**验收结果**：
- ✅ TypeScript 编译通过 (exit 0)
- ✅ 55 个新测试全部通过
- ✅ auth.ts 覆盖率 89% > 80% 目标
- ✅ CORS 可通过环境变量 `CORS_ALLOW_ORIGIN` 配置
- ✅ API 层无裸 console.log，logger 自动脱敏 API Key

---

## 第二阶段：架构优化（预计 3 周） ✅ 已完成

> 目标：解决代码膨胀和重复问题，提升可维护性  
> **完成日期：2026-02-14**

### Sprint 2.1 — Chat 组件拆分（P0） ✅

**原始状态**：`chat.tsx` 2247 行，承担所有聊天相关职责。

**实际交付：**

| 文件 | 职责 | 行数 |
|------|------|------|
| `chat.tsx` | 精简编排层：`Chat` 主组件 + `ChatMessagePanel` + `_Chat` 路由组件 | 1303 |
| `chat-hooks.tsx` | `useScrollToBottom`、`useShouldRender` 自定义 Hook | 48 |
| `chat-input.tsx` | `ChatInput` 组件：输入框 + `PromptHints` 提示列表 | 202 |
| `chat-actions.tsx` | `ChatAction` + `ChatActions` 操作按钮组 (已被 `sd.tsx` 外部引用) | 542 |
| `chat-modals.tsx` | `PromptToast`、`EditMessageModal`、`RenameDialog`、`usePromptStore` | 252 |
| **合计** | — | **2347** |

**效果**：主文件从 2247→1303 行 (-42%)，职责清晰分离，外部 API 兼容未变。

### Sprint 2.2 — Settings 组件拆分（P0） ✅

**原始状态**：`settings.tsx` ~1475 行，包含所有设置项。

**实际交付：**

| 文件 | 职责 | 行数 |
|------|------|------|
| `settings.tsx` | 精简编排层：通用设置 + 模型配置 + 各子模块组合 | 570 |
| `settings-provider.tsx` | 18 个 LLM Provider 的配置区块（OpenAI、Azure、Google、Anthropic 等） | 917 |
| `settings-sync.tsx` | `CheckButton`、`SyncConfigModal`、`SyncItems` 同步设置 | 323 |
| `settings-prompts.tsx` | `EditPromptModal`、`UserPromptModal` 提示词管理 | 175 |
| `settings-danger.tsx` | `DangerItems` 危险操作区 | 49 |
| **合计** | — | **2034** |

**效果**：主文件从 ~1475→570 行 (-61%)，Provider 配置集中管理于独立文件。

### Sprint 2.3 — 平台客户端抽象（P1） ✅

**实际交付：**

| 任务 | 描述 | 状态 |
|------|------|------|
| 2.3.1 | 创建 `BaseOpenAICompatibleApi` 基类 (`app/client/platforms/base.ts`, 408 行)：Template Method 模式，封装请求构建、流式解析 (含 think)、Tool Message、Vision 检测、错误处理 | ✅ |
| 2.3.2 | 迁移 6 个 OpenAI 兼容平台到基类 | ✅ |
| 2.3.3 | 保留 8 个独特协议平台为独立实现 (OpenAI、Anthropic、Google、Baidu、Alibaba、GLM、iFlytek、Tencent) | ✅ |

**迁移明细：**

| 平台 | 迁移前行数 | 迁移后行数 | 缩减率 | 特性 |
|------|-----------|-----------|--------|------|
| Moonshot | 236 | 20 | -92% | 纯配置，无覆写 |
| XAI (Grok) | 194 | 20 | -90% | `supportsVision: true` |
| ByteDance (豆包) | 251 | 24 | -90% | thinking + vision + usage |
| DeepSeek | 256 | 56 | -78% | thinking + 自定义 `buildMessages` (首消息必须为 user) |
| SiliconFlow | 290 | 71 | -76% | thinking + auto vision + 自定义 `models()` |
| 302.AI | 282 | 66 | -77% | thinking + auto vision + 自定义 `models()` |
| **合计** | **1509** | **257** | **-83%** | — |

**ProviderConfig 接口：**
```typescript
interface ProviderConfig {
  providerName: string;
  urlConfigKey: string;
  baseUrl: string;
  apiPath: string;
  chatPath: string;
  supportsThinking?: boolean;
  includeUsageInStream?: boolean;
  supportsVision?: boolean | "auto";
  stripAssistantThinking?: boolean;
}
```

**平台客户端总行数**：4386→3377 行 (-1009 行, -23%)。新增 OpenAI 兼容平台仅需 ~20 行配置。

### Sprint 2.4 — 模型管理动态化（P1） → 推迟至第四阶段

**决策说明**：模型管理动态化涉及 API 端点新增和 `constant.ts` 大范围改动，风险较高，独立于架构重构。已归入第四阶段 Sprint 4.2 统一处理。

**验收结果（Phase 2 整体）：**
- ✅ TypeScript 编译通过 (0 errors)
- ✅ 66 个测试全部通过
- ✅ Next.js 生产构建成功（所有路由正常）
- ✅ chat.tsx 主文件 2247→1303 行 (-42%)
- ✅ settings.tsx 主文件 ~1475→570 行 (-61%)
- ✅ 平台客户端 4386→3377 行 (-23%)，6 个平台迁移至基类 (-83% 代码量)
- ✅ 外部 API 和组件导出完全兼容，无 Breaking Change

---

## 第三阶段：性能优化（预计 2 周） ✅ 已完成

> 目标：降低首屏加载时间，优化运行时性能  
> **完成日期：2026-02-13**

### Sprint 3.1 — 包体积优化（P1） ✅

| 任务 | 描述 | 状态 |
|------|------|------|
| 3.1.1 | mermaid (~304KB, 5 chunks) 改为动态加载：仅在检测到 mermaid 代码块时 `import("mermaid")`，聊天页面不再预加载 mermaid | ✅ |
| 3.1.2 | js-tiktoken 完全动态化：`Tiktoken` 类 + BPE rank 数据均通过 `import()` 加载，初始 bundle 零 js-tiktoken 字节 | ✅ |
| 3.1.3 | 安装 `@next/bundle-analyzer`，`next.config.mjs` 集成，`ANALYZE=true` 即可生成交互式报告 | ✅ |
| 3.1.4 | `optimizePackageImports` 配置 lodash-es / emoji-picker-react / react-router-dom；lodash-es 改为 deep path import (`lodash-es/isEmpty`) | ✅ |

### Sprint 3.2 — 运行时性能优化（P1） ✅

| 任务 | 描述 | 状态 |
|------|------|------|
| 3.2.1 | `React.memo` 包裹 `ChatAction`、`TokenUsageIndicator`、`Mermaid`、`MarkdownContent`（已有）；核心回调 `onUserStop/onDelete/onResend/onPinMessage/deleteMessage` 包裹 `useCallback` | ✅ |
| 3.2.2 | 虚拟滚动 → 推迟至第四阶段（需引入新依赖 react-window，需与现有分页逻辑 `msgRenderIndex` 集成，风险较高） | ⏳ |
| 3.2.3 | 消息中的图片添加 `loading="lazy"` 属性，浏览器延迟加载非可视区域图片 | ✅ |

### Sprint 3.3 — 服务端性能（P2） ✅

| 任务 | 描述 | 状态 |
|------|------|------|
| 3.3.1 | 模型列表 API 已有 10 分钟缓存 ✅（Phase 1 已实现）；config API 新增 `max-age=300, stale-while-revalidate=3600` | ✅ |
| 3.3.2 | 新增 `fetchWithRetry()` 工具：指数退避重试，默认 3 次，`retryableStatuses: [429, 502, 503, 504]`，流式响应不重试，`AbortError` 立即抛出。已应用到 `proxy.ts` 和 `common.ts` (requestOpenai) | ✅ |
| 3.3.3 | 请求限流 → 推迟至第五阶段（需要 Redis 或 upstash 依赖，属于独立基础设施改造） | ⏳ |

**新增测试**：`test/fetch-retry.test.ts` — 12 个测试用例覆盖成功/失败/重试/流式/AbortError/自定义状态码等场景。

**验收结果（Phase 3 整体）：**
- ✅ TypeScript 编译通过 (0 errors)
- ✅ 78 个测试通过 (+12 新增)
- ✅ Next.js 生产构建成功，首页 First Load JS: 633 kB
- ✅ mermaid 不再静态加载，仅在需要时 ~304KB 按需加载
- ✅ js-tiktoken 完全动态化，初始 bundle 零字节
- ✅ 代理请求自动重试 429/502/503/504 错误
- ✅ Config API 5 分钟缓存 + 1 小时 stale-while-revalidate

---

## 阶段间评审记录

> 2026-02-14：Phase 1-3 全部完成并通过上线测试，进行全面代码审查后更新计划。

### 代码健康度快照（Phase 3 完成时）

| 指标 | 数值 | 备注 |
|------|------|------|
| 总代码行数 (app/) | 29,058 | .ts/.tsx 文件 |
| 测试数量 | 85 个 (8 个文件) | 覆盖集中在 auth/url-builder/logger |
| 最大组件文件 | chat.tsx 1,323 行 | Phase 2 已从 2,247 行拆分 |
| 最大 Store | chat.ts 951 行 | 未拆分，含状态+副作用+业务逻辑 |
| 平台客户端未迁移 | 8 个 (2,700+ 行) | openai/anthropic/google/glm/baidu/tencent/alibaba/iflytek |
| 首页 First Load JS | 633 kB | mermaid + tiktoken 已动态化 |
| 依赖 | React 18.2 / Next.js 14.1 / TS 5.2 | 均有主版本升级可用 |

### 已完成但未在原计划中的功能

| 功能 | 来源 | 状态 |
|------|------|------|
| Token 用量追踪 (`TokenUsage` 接口 + UI 进度条) | 近期提交 c63f9bce | ✅ |
| 发送前成本估算 (`useCostEstimate` hook) | 近期提交 875011ab | ✅ |
| 模型信息缓存 (`/api/model-info/` + 10min cache) | 近期提交 e32fc50f | ✅ |
| 快捷键基础框架 (6 个快捷键 + 提示面板) | 已存在于 chat.tsx | ✅ |

### 发现的新问题

| 问题 | 位置 | 严重度 |
|------|------|--------|
| `getMessageTextContentWithoutThinking()` 使用 `> ` 前缀判断 think 内容，会误删合法 blockquote | `app/utils.ts:248-269` | P1 |
| WebDAV `sync()` 中 `client.get()` 被调用两次（double-fetch） | `app/store/sync.ts:100,107` | P2 |
| `escapeBrackets()` 正则不匹配 `\[x\\]` 格式的 LaTeX | `app/components/markdown.tsx:262-277` | P2 |
| `RehypeKatex` 无 `strict`/`throwOnError` 配置，错误 LaTeX 显示红色报错 | `app/components/markdown.tsx` | P2 |
| `@vercel/analytics` 版本极旧 (0.1.11)，当前稳定版 1.x | `package.json` | P3 |
| `eslint-config-next` 13.4.19 与 Next.js 14.x 不匹配 | `package.json` | P3 |
| `rt-client` 通过 GitHub tarball 安装，非 npm 常规依赖 | `package.json` | P3 |

---

## 第四阶段：社区功能 + 代码健康（预计 4 周）

> 目标：实现 PRD 高价值需求 + 继续提升代码质量  
> 策略调整：将 "架构补全" 与 "社区功能" 交替进行，避免长周期无功能交付

### Sprint 4.1 — DeepSeek 思考过程 UI 优化 (#6137/#6183)（P0）

**现状分析**：思考内容通过 `streamWithThink()` 以 `> ` blockquote 格式渲染，无折叠/展开功能。`getMessageTextContentWithoutThinking()` 通过检测 `> ` 前缀过滤 think 内容，会误删合法 blockquote。

| 任务 | 描述 | 预估 |
|------|------|------|
| 4.1.1 | 实现 `ThinkBlock` 折叠/展开组件：默认折叠显示 "💭 思考过程"，点击展开，流式传输中自动展开 | 1d |
| 4.1.2 | 改造 think 内容标记机制：从 `> ` blockquote 改为专用标记（如 `<!--think-start-->` / `<!--think-end-->`），避免与合法 blockquote 冲突 | 1d |
| 4.1.3 | 修复 `getMessageTextContentWithoutThinking()`：基于新标记精确过滤，添加迁移逻辑兼容旧格式 | 0.5d |
| 4.1.4 | 适配所有 thinking 平台输出格式（DeepSeek、阿里云、OpenAI、Google `-thinking` 模型） | 0.5d |
| 4.1.5 | 补充思考过程相关测试（标记/过滤/折叠状态） | 0.5d |

### Sprint 4.2 — 自定义模型增强 (#4663/#5050/#5646)（P0）

**现状分析**：`CUSTOM_MODELS` 仅支持精确匹配和 `@provider` 语法，不支持通配符。Vision 能力仅通过内置正则列表 (`VISION_MODEL_REGEXES`) 判断，自定义模型无法声明 vision。

| 任务 | 描述 | 预估 |
|------|------|------|
| 4.2.1 | CUSTOM_MODELS 通配符支持 (#5050)：`-openai/*` 批量禁用、`+gpt-*@openai` 批量启用 | 1d |
| 4.2.2 | 自定义模型 vision 声明 (#4663)：`+mymodel[vision]@provider` 语法 + 图片输入按钮联动 | 0.5d |
| 4.2.3 | 自定义摘要模型 (#5646)：新增 `SUMMARIZE_MODEL` 配置项（环境变量 + UI），覆盖默认的标题/摘要生成模型 | 0.5d |
| 4.2.4 | 补充 `collectModelTable()` 通配符/vision 解析测试用例 | 0.5d |

### Sprint 4.3 — LaTeX 渲染修复 (#3239)（P1）

**现状分析**：`escapeBrackets()` 正则有边界条件 bug，`RehypeKatex` 无错误处理配置。

| 任务 | 描述 | 预估 |
|------|------|------|
| 4.3.1 | 修复 `escapeBrackets()` 正则：处理 `\[x\\]`、嵌套 `\(...\)` 边界情况 | 0.5d |
| 4.3.2 | 配置 `RehypeKatex`：`strict: false`, `throwOnError: false`，优雅降级而非红色报错 | 0.5d |
| 4.3.3 | 添加 LaTeX 渲染测试：常见公式、边界情况、行内/块级混合 | 0.5d |

### Sprint 4.4 — WebDAV 同步修复 (#4532/#2837/#4821)（P1）

**现状分析**：`sync()` 存在 double-fetch bug，无增量同步，无自动同步。

| 任务 | 描述 | 预估 |
|------|------|------|
| 4.4.1 | 修复 `sync()` double-fetch：合并两次 `client.get()` 为一次 | 0.5d |
| 4.4.2 | 修复删除对话恢复问题 (#2837)：添加 tombstone 标记，合并时尊重删除操作 | 1d |
| 4.4.3 | 实现基于时间戳的增量同步：对比 `lastSyncTime`，仅传输变更的对话 | 2d |
| 4.4.4 | 添加自动同步 (#4821)：可配置间隔（默认关闭），`visibilitychange` 事件触发 | 1d |
| 4.4.5 | WebDAV 同步测试（合并逻辑、增量检测、tombstone 处理） | 1d |

### Sprint 4.5 — 平台客户端迁移第二波（P1）

**现状分析**：8 个平台仍为独立实现（共 2,700+ 行），与 base.ts 存在大量重复代码。评估后 4 个可迁移（协议接近 OpenAI 兼容），4 个保持独立（协议差异大）。

| 任务 | 描述 | 预估 |
|------|------|------|
| 4.5.1 | 迁移 Alibaba（277 行）→ base.ts：需处理自定义 thinking 格式 | 0.5d |
| 4.5.2 | 迁移 GLM（292 行）→ base.ts：需适配本地 BasePayload 差异 | 0.5d |
| 4.5.3 | 迁移 iFlytek（253 行）→ base.ts 或 thin wrapper | 0.5d |
| 4.5.4 | 迁移 Tencent（278 行）→ base.ts 或 thin wrapper | 0.5d |
| 4.5.5 | 保留独立实现：OpenAI（587 行，代表性实现）、Anthropic（424 行，非 OpenAI 协议）、Google（317 行，Gemini 协议）、Baidu（284 行，认证签名特殊） | — |
| 4.5.6 | 平台客户端集成测试（至少覆盖 chat/models 方法的请求构建） | 1d |

**预期效果**：平台客户端从 3,371 → ~2,300 行（-30%）

### Sprint 4.6 — 测试覆盖扩展（P1）

**现状分析**：85 个测试覆盖 29,058 行代码，测试比不足 0.3%。核心业务逻辑（chat store、组件交互、平台客户端）零测试覆盖。

| 任务 | 描述 | 预估 |
|------|------|------|
| 4.6.1 | chat.ts store 测试：消息管理（增删改）、上下文裁剪、记忆生成 | 1d |
| 4.6.2 | model.ts 工具测试：`collectModelTable()`、`isVisionModel()`、模型过滤逻辑 | 0.5d |
| 4.6.3 | 修复已有的 2 个失败测试（model-available 逻辑错误、nanoid ESM 兼容） | 0.5d |

**目标**：测试数量从 85 → 120+（40% 增长），chat store 覆盖率 > 60%

---

## 第五阶段：高级功能 + 技术升级（预计 6+ 周）

> 目标：实现高价值进阶功能，同步进行技术栈现代化

### Sprint 5.1 — 联网搜索 (#6165)

**现状分析**：MCP 基础设施已存在（`app/mcp/` 699 行），支持 Server Actions + stdio transport。但 MCP 仅限服务端环境，纯静态部署不可用。

| 任务 | 描述 | 预估 |
|------|------|------|
| 5.1.1 | 基于现有 MCP 框架实现 web-search tool（复用 `actions.ts` 调度） | 1d |
| 5.1.2 | 搜索结果引用显示 UI（行内引用编号 + 底部来源卡片） | 1d |
| 5.1.3 | 可配置搜索引擎（Google、Bing、DuckDuckGo；环境变量 + UI 选择） | 1d |
| 5.1.4 | 非 MCP 环境降级方案（通过 API 端点代理搜索请求） | 1d |

### Sprint 5.2 — 文档问答 (#5096)

| 任务 | 描述 | 预估 |
|------|------|------|
| 5.2.1 | 文件上传组件（支持 PDF、TXT、DOCX、Markdown） | 2d |
| 5.2.2 | 文件内容提取和分块（客户端处理，无需额外后端） | 2d |
| 5.2.3 | 上下文注入与引用显示 | 2d |

### Sprint 5.3 — 实时语音对话增强 (#5672/#3110)

**现状分析**：`realtime-chat/` 已有基础实现（361 行），支持 OpenAI 和 Azure Realtime API，但功能有限 — 无文本显示、无错误恢复、TODO 较多。

| 任务 | 描述 | 预估 |
|------|------|------|
| 5.3.1 | 补全实时对话功能：上下文消息发送（已有 TODO）、文本实时显示、错误恢复 | 2d |
| 5.3.2 | 统一多模态消息格式：文本 + 图片 + 音频统一的 `MultimodalContent` 处理 | 2d |
| 5.3.3 | 音频输入/输出增强：非 Realtime API 的标准音频消息支持 | 3d |

### Sprint 5.4 — 依赖升级路线图

**现状分析**：核心依赖落后主版本。

| 任务 | 描述 | 预估 | 风险 |
|------|------|------|------|
| 5.4.1 | TypeScript 5.2 → 5.7+：解锁 `satisfies`、NoInfer 等新特性 | 0.5d | 低 |
| 5.4.2 | ESLint 8 → 9 + flat config + eslint-config-next 14.x 对齐 | 1d | 中 |
| 5.4.3 | Next.js 14 → 15：App Router 稳定、React 19 支持（需单独分支） | 2d | 高 |
| 5.4.4 | React 18 → 19：Server Components 增强、useFormStatus 等（依赖 Next.js 15） | 1d | 高 |
| 5.4.5 | 清理问题依赖：`@vercel/analytics` 0.1→1.x、`node-fetch` 移除（Next.js 内置）、`rt-client` 改用 npm 发布版本 | 0.5d | 低 |

**策略**：5.4.1-5.4.2 可独立进行；5.4.3-5.4.4 必须在单独分支完整测试。

### Sprint 5.5 — 国际化恢复

| 任务 | 描述 | 预估 |
|------|------|------|
| 5.5.1 | 从原项目恢复主要语言包 (ja, ko, es, de, fr 等) | 1d |
| 5.5.2 | 建立翻译贡献流程 | 0.5d |
| 5.5.3 | 添加语言完整性检查脚本（对比 cn.ts 的 key 完整度） | 0.5d |

---

## 推迟事项追踪

| 事项 | 原计划 | 推迟原因 | 目标阶段 |
|------|--------|----------|----------|
| 虚拟滚动 (react-window) | Phase 3 Sprint 3.2 | 需引入新依赖 + 与 `msgRenderIndex` 分页集成，风险高 | Phase 5+ |
| 请求限流 (upstash) | Phase 3 Sprint 3.3 | 需 Redis 基础设施，独立改造 | Phase 5+ |
| 模型管理动态化 | Phase 2 Sprint 2.4 | 涉及 API 端点 + constant.ts 大改动 | Phase 5+ |
| chat.ts Store 拆分 | — (新发现) | 951 行含状态+副作用+业务逻辑，应拆为 chat-state + chat-actions | Phase 5+ |

---

## 持续改进事项

### CI/CD 改进

| 事项 | 描述 | 优先级 |
|------|------|--------|
| 版本发布流程 | 引入语义化版本 (semver) + git tag + CHANGELOG 自动生成 | P1 |
| CI 测试门禁 | PR 必须通过测试 + 覆盖率不降低 | P1 |
| 依赖自动更新 | 启用 Dependabot / Renovate | P2 |
| 构建缓存 | 配置 Turborepo 或 Next.js 构建缓存 | P2 |
| 预览部署 | PR 自动部署预览环境 | P2 |

### 代码规范

| 事项 | 描述 | 优先级 |
|------|------|--------|
| ESLint 升级到 v9 | 使用 flat config 格式（归入 Sprint 5.4.2） | P2 |
| 启用 unused-imports 规则 | 当前设为 off，应改为 warn | P1 |
| 添加 Prettier 格式化 | 统一代码风格 | P2 |
| 组件文件大小限制 | ESLint 自定义规则，单文件不超过 500 行 | P2 |

### 监控与可观测性

| 事项 | 描述 | 优先级 |
|------|------|--------|
| 错误上报 | 集成 Sentry 或类似服务 | P1 |
| 性能监控 | Web Vitals 持续追踪 | P2 |
| API 调用监控 | 成功率、延迟、Token 消耗统计（基础已有 TokenUsage 接口） | P2 |

---

## 里程碑时间线

```
2026-02              2026-03              2026-04              2026-05              2026-06
   │                    │                    │                    │                    │
   ├── Phase 1 ✅ ──────┤                    │                    │                    │
   │   基础加固          │                    │                    │                    │
   ├── Phase 2 ✅ ──────┤                    │                    │                    │
   │   架构优化          │                    │                    │                    │
   ├── Phase 3 ✅ ──────┤                    │                    │                    │
   │   性能优化          │                    │                    │                    │
   │                    ├──── Phase 4 ────────┤                    │                    │
   │                    │  社区功能+代码健康    │                    │                    │
   │                    │                    ├───── Phase 5 ───────┤────────────────────┤
   │                    │                    │  高级功能+技术升级    │                    │
```

### 关键里程碑

| 日期 | 里程碑 | 验收指标 |
|------|--------|---------|
| 2026-02-13 | Phase 1 完成 ✅ | 55 测试通过，auth 覆盖率 89%，API 层零裸 console.log |
| 2026-02-14 | Phase 2 完成 ✅ | chat.tsx 1303 行，新增平台 20 行，66 测试通过 |
| 2026-02-14 | Phase 3 完成 ✅ | mermaid/tiktoken 动态化，fetchWithRetry，78 测试通过 |
| 2026-03-14 | Phase 4 完成 | Think 折叠 UI、CUSTOM_MODELS 通配符、LaTeX 修复、WebDAV 增量同步、测试 120+ |
| 2026-05-30 | Phase 5 完成 | 联网搜索、文档问答、实时语音增强、依赖升级到最新 |

---

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| Think 标记格式变更导致历史消息渲染异常 | 高 | 中 | 4.1.3 中实现旧格式兼容迁移 |
| WebDAV 增量同步引入数据丢失 | 中 | 高 | tombstone 机制 + 完整测试 + 用户可选 fallback 到全量同步 |
| Next.js 15 升级引入 Breaking Changes | 高 | 中 | 单独分支测试，Phase 5.4 处理 |
| 平台 API 频繁变化 | 高 | 低 | 动态模型管理 + 平台抽象层 (base.ts) |
| 重构导致回归 bug | 中 | 高 | Sprint 4.6 扩展测试覆盖；每次重构前先补充测试 |
| 社区贡献质量参差不齐 | 中 | 中 | PR Review 流程 + CI 门禁 |
| 大依赖懒加载影响用户体验 | 低 | 中 | 已有 loading 状态（Phase 3），可追加 prefetch 策略 |

---

*本计划为滚动规划，每个阶段完成后进行全面审查更新。上次审查：2026-02-14（Phase 3 完成后）。*
