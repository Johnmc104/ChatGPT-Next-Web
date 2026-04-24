# NextChat 开发计划与变更记录

> 维护团队接手日期：2026-02-03  
> 上次更新：2026-04-03  
> 基于：[工程分析报告](project-analysis.md) 和 [社区需求 PRD](../prd.md)

---

## 项目背景

NextChat (ChatGPT-Next-Web) 原由 Yidadaa 创建，是一款支持多 LLM Provider 的开源聊天客户端。原作者已不再活跃维护，社区 fork 分支于 **2026-02-03** 正式接手维护。

接手后面临的核心问题：
- 认证/代理逻辑频繁出 bug（近期 50%+ 的 fix 提交集中于此）
- 超大组件文件难以维护（chat.tsx 2247 行、settings.tsx 1931 行）
- 14 个平台客户端存在大量重复代码
- 测试覆盖率极低（仅 0.6%）
- 关键依赖未做懒加载导致首屏过大

---

## 开发原则

1. **稳定优先** — 先修复系统性问题，再开发新功能
2. **渐进重构** — 每次变更可控，不做大爆炸式重写
3. **测试保障** — 新代码必须有测试覆盖
4. **社区驱动** — 功能优先级参考 GitHub Issues 热度

---

## 已完成阶段

### Phase 1：基础加固 ✅

> 完成日期：2026-02-13 | 提交：`2d53bae9`、`e84ea159`

**Sprint 1.1 — 认证与代理重构**

| 交付项 | 说明 |
|-------|------|
| 统一日志工具 `logger.ts` | 自动脱敏 API Key，按环境分级（debug/info/warn/error） |
| 共享 URL 构建工具 `url-builder.ts` | `buildFetchUrl()`、`normalizeBaseUrl()` 等，消除 3 处重复 |
| 重构 `auth.ts` / `proxy.ts` / `common.ts` / `provider.ts` | proxy.ts 163→~80 行，统一使用共享工具 |

**Sprint 1.2 — 安全加固**

| 交付项 | 说明 |
|-------|------|
| API 层 console.log 全部替换为 logger | 覆盖 15 个 API 文件 |
| ESLint `no-console` 规则 | `["warn", { "allow": ["warn", "error"] }]` |
| CORS 环境变量控制 | `CORS_ALLOW_ORIGIN`（默认 `*`） |

**Sprint 1.3 — 测试基础**

| 测试文件 | 用例数 | 覆盖率 |
|---------|--------|--------|
| `auth.test.ts` | 16 | 89% |
| `url-builder.test.ts` | 27 | 99% |
| `logger.test.ts` | 12 | 98% |

---

### Phase 2：架构优化 ✅

> 完成日期：2026-02-14 | 提交：`59146d33`

**Chat 组件拆分**（chat.tsx 2247→1303 行，-42%）

| 新文件 | 职责 | 行数 |
|-------|------|------|
| `chat-hooks.tsx` | `useScrollToBottom` 等 Hook | 48 |
| `chat-input.tsx` | 输入框 + PromptHints | 202 |
| `chat-actions.tsx` | 操作按钮组 | 542 |
| `chat-modals.tsx` | 配置/编辑弹窗 | 252 |

**Settings 组件拆分**（settings.tsx ~1475→570 行，-61%）

| 新文件 | 职责 | 行数 |
|-------|------|------|
| `settings-provider.tsx` | 18 个 Provider 配置区块 | 917 |
| `settings-sync.tsx` | 同步设置 | 323 |
| `settings-prompts.tsx` | 提示词管理 | 175 |
| `settings-danger.tsx` | 危险操作区 | 49 |

**平台客户端抽象**

创建 `BaseOpenAICompatibleApi` 基类（`base.ts`, 408 行），采用 Template Method 模式。迁移 6 个兼容平台：

| 平台 | 迁移前 | 迁移后 | 缩减率 |
|------|--------|--------|--------|
| Moonshot | 236 | 20 | -92% |
| XAI (Grok) | 194 | 20 | -90% |
| ByteDance | 251 | 24 | -90% |
| DeepSeek | 256 | 56 | -78% |
| SiliconFlow | 290 | 71 | -76% |
| 302.AI | 282 | 66 | -77% |
| **合计** | **1509** | **257** | **-83%** |

---

### Phase 3：性能优化 ✅

> 完成日期：2026-02-14 | 提交：`f8de1fe7`

| 优化项 | 效果 |
|-------|------|
| mermaid (~304KB) 动态加载 | 仅在检测到 mermaid 代码块时按需加载 |
| js-tiktoken 完全动态化 | 初始 bundle 零字节 |
| `@next/bundle-analyzer` 集成 | `ANALYZE=true` 生成交互式报告 |
| `React.memo` / `useCallback` 优化 | ChatAction 等组件减少不必要重渲染 |
| 图片 `loading="lazy"` | 延迟加载非可视区域图片 |
| `fetchWithRetry()` 工具 | 指数退避重试 429/502/503/504，流式不重试 |
| Config API 缓存 | `max-age=300, stale-while-revalidate=3600` |

---

### RAGFlow 集成 ✅

> 完成日期：2026-03-04 | 提交：`d68738ee` ~ `828de2d7`

新增 RAGFlow 知识库问答支持，包括：
- `RAGFlowApi` 客户端（独立于统一代理架构，拥有自己的 `skipUnifiedProxy` 选项）
- Access Store 新增 RAGFlow 配置字段
- Provider 识别与模型排序

---

### 构建与 CI 修复 ✅

> 完成日期：2026-03-18 | 提交：`a2a35102` ~ `50a50e70`

| 修复项 | 说明 |
|-------|------|
| webpack.IgnorePlugin 处理 `bufferutil`/`utf-8-validate` | 解决 rt-client/ws 可选原生模块构建失败 |
| Jest 测试修复 | model-available 和 vision-model-checker 逻辑修正 |
| Vercel ENOTDIR 错误 | 移除项目根目录多余的 `cmd` 文件 |

---

### fetchWithRetry 空 body 修复 ✅

> 完成日期：2026-04-03 | 提交：`a6746ea3`

**问题**：`ReadableStream` 只能消费一次。当 `fetchWithRetry` 遇到可重试状态码（429/502/503/504）时，已消费的 stream 导致重试请求 body 为空。

**修复**：在 `common.ts` 和 `proxy.ts` 中，构建 `fetchOptions` 前将 `req.body` 读为字符串，确保重试安全。

---

## 当前状态快照（2026-04-03）

| 指标 | 数值 |
|------|------|
| 总代码行数 (app/) | ~28,900 行 |
| 测试用例 | 113 个（10 个文件） |
| 最大组件 | chat.tsx 1,303 行 |
| 最大 Store | chat.ts ~950 行 |
| 平台客户端（基类） | 6 个迁移至 base.ts |
| 平台客户端（独立） | 8 个 |

---

## 待做阶段

### Phase 4：社区功能 + 代码健康

> 策略：将架构补全与社区功能交替进行

#### Sprint 4.1 — DeepSeek 思考过程 UI 优化 (#6137/#6183)

- 实现 `ThinkBlock` 折叠/展开组件
- 将 think 内容标记从 `> ` blockquote 改为 `<!--THINKING-->` 专用标记（已部分完成于 `streamWithThink`）
- 修复 `getMessageTextContentWithoutThinking()` 误删合法 blockquote

#### Sprint 4.2 — 自定义模型增强 (#4663/#5050/#5646)

- CUSTOM_MODELS 通配符支持（如 `-openai/*`）
- 自定义模型 vision 声明（`+mymodel[vision]@provider`）
- 自定义摘要模型配置项

#### Sprint 4.3 — LaTeX 渲染修复 (#3239)

- 修复 `escapeBrackets()` 正则边界条件
- 配置 RehypeKatex 无错误模式

#### Sprint 4.4 — WebDAV 同步修复 (#4532/#2837/#4821)

- 修复 `sync()` double-fetch bug
- 添加 tombstone 标记解决删除恢复问题
- 实现增量同步

#### Sprint 4.5 — 平台客户端迁移第二波

- 迁移 Alibaba / GLM / iFlytek / Tencent 至 base.ts
- 保留独立实现：OpenAI / Anthropic / Google / Baidu

#### Sprint 4.6 — 测试覆盖扩展

- 目标：测试数量 113 → 150+
- 重点：chat store、model 过滤逻辑

---

### Phase 5：高级功能 + 技术升级

#### Sprint 5.1 — 联网搜索 (#6165)

基于现有 MCP 框架实现 web-search tool，搜索结果引用 UI。

#### Sprint 5.2 — 文档问答 (#5096)

文件上传 + 客户端内容提取分块 + 上下文注入。

#### Sprint 5.3 — 实时语音增强 (#5672/#3110)

补全 `realtime-chat/` 功能：上下文发送、文本显示、错误恢复。

#### Sprint 5.4 — 依赖升级

| 依赖 | 当前 | 目标 |
|------|------|------|
| TypeScript | 5.2 | 5.7+ |
| ESLint | 8 | 9 (flat config) |
| Next.js | 14 | 15 |
| React | 18 | 19 |

---

## 推迟事项追踪

| 事项 | 原计划 | 推迟原因 | 目标阶段 |
|------|--------|----------|----------|
| 虚拟滚动 (react-window) | Phase 3 | 与 `msgRenderIndex` 分页集成风险高 | Phase 5+ |
| 请求限流 (upstash) | Phase 3 | 需 Redis 基础设施 | Phase 5+ |
| 模型管理动态化 | Phase 2 | constant.ts 大改动风险 | Phase 5+ |
| chat.ts Store 拆分 | — | 950 行混合状态 + 副作用 + 业务逻辑 | Phase 5+ |

---

## 完整提交时间线

| 日期 | 阶段 | 关键提交 |
|------|------|---------|
| 2026-02-03 | 接手维护 | Cloudflare/OpenRouter 支持、ModelSelector、模型分组 |
| 2026-02-04 | 修复期 | 认证逻辑、代理路由、模型过滤 ~20 次 fix 提交 |
| 2026-02-10 | 整合 | API handler 重构、provider 逻辑合并、URL 构建修复 |
| 2026-02-11 | 功能 | Token 用量追踪、成本估算、模型信息缓存 |
| 2026-02-13 | Phase 1 ✅ | auth/proxy 重构、logger、安全加固、55 测试 |
| 2026-02-13 | Phase 2 ✅ | 组件拆分、平台客户端抽象 |
| 2026-02-13 | Phase 3 ✅ | 性能优化、fetchWithRetry、包体积优化 |
| 2026-03-04 | RAGFlow ✅ | RAGFlow 集成（9 次提交） |
| 2026-03-18 | CI/Build ✅ | webpack/Jest/Vercel 构建修复 |
| 2026-04-03 | Bug Fix ✅ | fetchWithRetry 空 body 修复 |

---

*本计划为滚动规划，每阶段完成后审查更新。上次更新：2026-04-03。*
