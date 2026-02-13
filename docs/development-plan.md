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

## 第三阶段：性能优化（预计 2 周）

> 目标：降低首屏加载时间，优化运行时性能

### Sprint 3.1 — 包体积优化（P1）

| 任务 | 描述 | 影响 | 预估 |
|------|------|------|------|
| 3.1.1 | mermaid (22MB) 改为动态加载：仅在检测到 mermaid 代码块时 `import()` | 首屏 -30% | 0.5d |
| 3.1.2 | js-tiktoken (22MB) 改为服务端计算或 Web Worker | 首屏 -30% | 1d |
| 3.1.3 | 添加 `@next/bundle-analyzer` 分析工具 | 可度量 | 0.5d |
| 3.1.4 | 配置 Tree Shaking 优化 lodash-es 按需导入 | 包体积 -5% | 0.5d |

### Sprint 3.2 — 运行时性能优化（P1）

| 任务 | 描述 | 预估 |
|------|------|------|
| 3.2.1 | 关键组件添加 `React.memo` 和 `useCallback` | 1d |
| 3.2.2 | 消息列表添加虚拟滚动 (react-window) | 1d |
| 3.2.3 | 图片预览组件懒加载 | 0.5d |
| 3.2.4 | 添加 Web Vitals 监控 (已有 @vercel/speed-insights) | 0.5d |

### Sprint 3.3 — 服务端性能（P2）

| 任务 | 描述 | 预估 |
|------|------|------|
| 3.3.1 | 模型列表 API 添加缓存（5 分钟 TTL） | 0.5d |
| 3.3.2 | 代理请求添加超时重试机制 | 0.5d |
| 3.3.3 | 添加基础请求限流 (可选 upstash 方案) | 1d |

---

## 第四阶段：社区高需求功能（预计 4 周）

> 目标：实现 PRD 中高价值低难度的功能需求

### Sprint 4.1 — DeepSeek 思考过程优化 (#6137/#6183)

| 任务 | 描述 | 预估 |
|------|------|------|
| 4.1.1 | 实现 `<think>` 标签内容的折叠/展开 UI 组件 | 1d |
| 4.1.2 | 适配阿里云 DeepSeek 的 think 内容格式 | 0.5d |
| 4.1.3 | 适配其他平台的 reasoning 输出格式 | 0.5d |

### Sprint 4.2 — 自定义模型增强 (#4663/#5050/#5646)

| 任务 | 描述 | 预估 |
|------|------|------|
| 4.2.1 | 自定义模型支持图片输入配置 (#4663) | 0.5d |
| 4.2.2 | CUSTOM_MODELS 支持通配符/正则 (#5050) | 0.5d |
| 4.2.3 | 允许自定义生成聊天标题的模型 (#5646) | 0.5d |

### Sprint 4.3 — WebDAV 同步增强 (#4532/#2837/#4821)

| 任务 | 描述 | 预估 |
|------|------|------|
| 4.3.1 | 修复 WebDAV 同步后删除的对话恢复问题 (#2837) | 1d |
| 4.3.2 | 实现基于时间戳的增量同步 | 2d |
| 4.3.3 | 添加自动同步选项（可配置间隔） (#4821) | 1d |

### Sprint 4.4 — 快捷键与 UX 提升 (#5135)

| 任务 | 描述 | 预估 |
|------|------|------|
| 4.4.1 | 实现快捷键框架 (`useHotkeys` hook) | 0.5d |
| 4.4.2 | Ctrl+N 新对话、Ctrl+K 搜索、Ctrl+/ 切换侧栏等 | 1d |
| 4.4.3 | 快捷键提示面板 | 0.5d |

### Sprint 4.5 — LaTeX 渲染修复 (#3239)

| 任务 | 描述 | 预估 |
|------|------|------|
| 4.5.1 | 排查 markdown 渲染流水线中 LaTeX 被错误转义的问题 | 1d |
| 4.5.2 | 添加 LaTeX 渲染测试用例 | 0.5d |

---

## 第五阶段：高级功能（预计 6+ 周）

> 目标：实现高价值高难度的进阶功能

### Sprint 5.1 — 联网搜索 (#6165)

| 任务 | 描述 | 预估 |
|------|------|------|
| 5.1.1 | 基于 MCP 框架实现搜索工具 | 2d |
| 5.1.2 | 搜索结果引用显示 UI | 1d |
| 5.1.3 | 可配置搜索引擎 (Google, Bing, DuckDuckGo) | 1d |

### Sprint 5.2 — 文档问答 (#5096)

| 任务 | 描述 | 预估 |
|------|------|------|
| 5.2.1 | 文件上传组件 (支持 PDF, TXT, DOCX) | 2d |
| 5.2.2 | 文件内容提取和分块 | 2d |
| 5.2.3 | 上下文注入与引用显示 | 2d |

### Sprint 5.3 — 多模态增强 (#3110)

| 任务 | 描述 | 预估 |
|------|------|------|
| 5.3.1 | 统一多模态消息格式 | 2d |
| 5.3.2 | 音频输入/输出支持 | 3d |
| 5.3.3 | 实时语音对话 (OpenAI Realtime API) (#5672) | 5d |

### Sprint 5.4 — 国际化恢复

| 任务 | 描述 | 预估 |
|------|------|------|
| 5.4.1 | 从原项目恢复主要语言包 (ja, ko, es, de, fr 等) | 1d |
| 5.4.2 | 建立翻译贡献流程 | 0.5d |
| 5.4.3 | 添加语言完整性检查脚本 | 0.5d |

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
| ESLint 升级到 v9 | 使用 flat config 格式 | P2 |
| 启用 unused-imports 规则 | 当前设为 off，应改为 warn | P1 |
| 添加 Prettier 格式化 | 统一代码风格 | P2 |
| 组件文件大小限制 | ESLint 自定义规则，单文件不超过 500 行 | P2 |

### 监控与可观测性

| 事项 | 描述 | 优先级 |
|------|------|--------|
| 错误上报 | 集成 Sentry 或类似服务 | P1 |
| 性能监控 | Web Vitals 持续追踪 | P2 |
| API 调用监控 | 成功率、延迟、Token 消耗统计 | P2 |

---

## 里程碑时间线

```
2026-02    2026-03    2026-04    2026-05    2026-06
   │          │          │          │          │
   ├─ Phase 1 ─┤          │          │          │
   │  基础加固  │          │          │          │
   │           ├── Phase 2 ──┤        │          │
   │           │  架构优化    │        │          │
   │           │             ├ Phase 3 ┤          │
   │           │             │ 性能优化 │          │
   │           │             │         ├─ Phase 4 ──┤
   │           │             │         │ 社区功能    │
   │           │             │         │            ├─ Phase 5 ──>
   │           │             │         │            │   高级功能
```

### 关键里程碑

| 日期 | 里程碑 | 验收指标 |
|------|--------|---------|
| 2026-02-28 | Phase 1 完成 | 测试覆盖率 >15%，auth 模块零重复 fix |
| 2026-03-21 | Phase 2 完成 | chat.tsx <500 行，新增平台 <50 行 |
| 2026-04-04 | Phase 3 完成 | 首屏加载时间 <3s (4G)，Lighthouse >80 |
| 2026-05-02 | Phase 4 完成 | 完成 5 个社区高需求 Issue |
| 2026-06-30 | Phase 5 完成 | 支持联网搜索 + 文档问答 |

---

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| Next.js 15 升级引入 Breaking Changes | 高 | 中 | 在 Phase 3 后单独分支测试 |
| 平台 API 频繁变化 | 高 | 低 | 动态模型管理 + 平台抽象层 |
| 重构导致回归 bug | 中 | 高 | 每次重构前先补充测试 |
| 社区贡献质量参差不齐 | 中 | 中 | PR Review 流程 + CI 门禁 |
| 大依赖懒加载影响用户体验 | 低 | 中 | 添加 loading 状态 + 预加载策略 |

---

*本计划为滚动规划，建议每 2 周回顾一次，根据实际进度和社区反馈调整优先级。*
