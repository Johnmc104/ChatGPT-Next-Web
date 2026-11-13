# NextChat 后续开发计划 v2

> 编写日期: 2026-04-24  
> 基于: [架构评审报告](02-architecture-review.md)、[开发计划 v1](archive/development-plan.md)、[工程分析报告](01-project-analysis.md)、[图片功能方案](03-image-features-plan.md)、[社区需求 PRD](../prd.md)  
> 前置条件: R1–R15 架构重构已全部完成，16 套件 235 测试全通过

---

## 一、当前状态快照（2026-04-24）

| 指标 | 数值 | 对比 v1 (04-03) |
|------|------|-----------------|
| 总代码行数 (app/) | ~25,566 行 | -3,334（清理非 OpenAI Provider） |
| 源文件数 (app/) | 127 | — |
| 测试文件 | 16 | +6 |
| 测试用例 | 235 | +122 |
| 平台客户端 | 3（openai.ts + base.ts + ragflow.ts） | -11（已清理） |
| 最大组件 | chat.tsx 986 行 | -317（R13-R14 拆分） |
| 最大 Store | chat.ts 951 行 | 不变 |
| API 端点 | 6（provider proxy + config + image-gen + image-edit + model-info + webdav） | +2 |

---

## 二、已完成阶段汇总

| 阶段 | 完成日期 | 核心交付 |
|------|---------|---------|
| Phase 1: 基础加固 | 2026-02-13 | auth/proxy 重构、logger、安全加固、55 测试 |
| Phase 2: 架构优化 | 2026-02-14 | 组件拆分（chat -42%, settings -61%）、平台客户端基类 |
| Phase 3: 性能优化 | 2026-02-14 | mermaid/tiktoken 懒加载、fetchWithRetry、缓存 |
| RAGFlow 集成 | 2026-03-04 | RAGFlowApi 客户端 + access store 配置 |
| CI/Build 修复 | 2026-03-18 | webpack/Jest/Vercel 构建修复 |
| 图片功能 (15 提交) | 2026-04-24 | 图片生成/编辑/预览/配置面板/lightbox |
| R1–R15 架构重构 | 2026-04-24 | SSE 心跳提取、Blob 泄漏修复、chat.tsx 拆分至 986 行、模型检测统一 |

---

## 三、待做事项清单

### F-01 — 图片蒙版编辑（Mask Editor）

**来源**: 03-image-features-plan.md Phase 3  
**优先级**: P1 | **难度**: ⭐⭐⭐⭐ | **价值**: ⭐⭐⭐⭐

OpenAI `/v1/images/edits` 支持 `mask` 参数（PNG + alpha 通道），当前仅支持全图编辑。

| 子任务 | 说明 |
|--------|------|
| F-01a | 实现 Canvas 蒙版绘制组件（`ChatMaskEditor.tsx`），支持画笔/橡皮擦/撤销 |
| F-01b | 将蒙版导出为 PNG + alpha，追加到 image-edit FormData |
| F-01c | 多轮编辑：保留上一次编辑结果作为下一次输入 |

**预计文件**: 新增 `app/components/mask-editor.tsx` + `mask-editor.module.scss`，改动 `openai.ts`、`image-edit/route.ts`

---

### F-02 — DeepSeek 思考过程可折叠 (#6137/#6183)

**来源**: prd.md、archive/development-plan.md Sprint 4.1  
**优先级**: P1 | **难度**: ⭐⭐ | **价值**: ⭐⭐⭐⭐

| 子任务 | 说明 |
|--------|------|
| F-02a | 新增 `ThinkBlock` 折叠/展开组件，替换当前 `> ` blockquote 渲染 |
| F-02b | 修复 `getMessageTextContentWithoutThinking()` 误删合法 blockquote（01-project-analysis.md P1 问题） |
| F-02c | 适配阿里云 DeepSeek 的 `<think>` 标签格式 |

**预计文件**: 新增 `app/components/think-block.tsx`，改动 `markdown.tsx`、`utils.ts`

---

### F-03 — CUSTOM_MODELS 通配符支持 (#5050)

**来源**: prd.md  
**优先级**: P1 | **难度**: ⭐⭐ | **价值**: ⭐⭐⭐⭐

当前 `CUSTOM_MODELS` 只能逐个添加/删除模型，需支持通配符（如 `-openai/*` 批量禁用某 provider 下所有模型）。

| 子任务 | 说明 |
|--------|------|
| F-03a | 扩展 `constant.ts` 中 CUSTOM_MODELS 解析，支持 `*` 和 `?` 通配符 |
| F-03b | 补充测试覆盖通配符匹配逻辑 |

**预计文件**: 改动 `constant.ts`，新增测试

---

### F-04 — 自定义模型 Vision 声明 (#4663)

**来源**: prd.md  
**优先级**: P1 | **难度**: ⭐ | **价值**: ⭐⭐⭐⭐

自定义模型无法标记为 vision 模型（无图片上传按钮）。需在 `CUSTOM_MODELS` 语法中支持能力声明。

| 子任务 | 说明 |
|--------|------|
| F-04a | 扩展语法：`+mymodel[vision,image]@provider` 方括号声明能力 |
| F-04b | 与现有 `useModelInfo` 能力系统打通 |

**预计文件**: 改动 `constant.ts`、`hooks/useModelInfo.ts`

---

### F-05 — 自定义摘要模型 (#5646)

**来源**: prd.md  
**优先级**: P1 | **难度**: ⭐ | **价值**: ⭐⭐⭐⭐

当前聊天标题和摘要生成使用与对话相同的模型，用户希望指定轻量模型以节省成本。

| 子任务 | 说明 |
|--------|------|
| F-05a | `config.ts` / access store 新增 `summarizeModel` 配置项 |
| F-05b | `chat.ts` 摘要/标题生成使用该配置（fallback 到当前模型） |
| F-05c | Settings UI 新增摘要模型选择器 |

**预计文件**: 改动 `store/config.ts`、`store/chat.ts`、`settings.tsx`

---

### F-06 — LaTeX 渲染修复 (#3239)

**来源**: prd.md、01-project-analysis.md  
**优先级**: P2 | **难度**: ⭐⭐⭐ | **价值**: ⭐⭐⭐⭐

长期问题，`escapeBrackets()` 正则边界条件导致公式渲染异常。

| 子任务 | 说明 |
|--------|------|
| F-06a | 修复 `escapeBrackets()` 正则边界 bug |
| F-06b | 配置 RehypeKatex `throwOnError: false` |
| F-06c | 补充 LaTeX 边界用例测试（扩展 `latex-escape.test.ts`） |

**预计文件**: 改动 `components/markdown.tsx`，扩展测试

---

### F-07 — WebDAV 同步修复 (#4532/#2837/#4821)

**来源**: prd.md、archive/development-plan.md Sprint 4.4  
**优先级**: P2 | **难度**: ⭐⭐⭐ | **价值**: ⭐⭐⭐⭐

| 子任务 | 说明 |
|--------|------|
| F-07a | 修复 `sync()` double-fetch bug |
| F-07b | 添加 tombstone 标记解决删除恢复问题 |
| F-07c | 实现增量同步（差异比较而非全量替换） |
| F-07d | 自动同步（定时 + 页面离开时触发） |

**预计文件**: 改动 `store/sync.ts`、`api/webdav/`

---

### F-08 — 联网搜索 (#6165)

**来源**: prd.md、archive/development-plan.md Sprint 5.1  
**优先级**: P2 | **难度**: ⭐⭐⭐ | **价值**: ⭐⭐⭐⭐

| 子任务 | 说明 |
|--------|------|
| F-08a | 基于现有 MCP 框架实现 web-search tool |
| F-08b | 搜索结果引用 UI（来源链接 + 摘要卡片） |
| F-08c | 默认 MCP 配置中内置 web-search server |

**预计文件**: 新增 MCP server 配置，改动 `mcp/`、chat 组件

---

### F-09 — 文档问答 (#5096)

**来源**: prd.md、archive/development-plan.md Sprint 5.2  
**优先级**: P2 | **难度**: ⭐⭐⭐⭐ | **价值**: ⭐⭐⭐⭐

| 子任务 | 说明 |
|--------|------|
| F-09a | 文件上传 UI（PDF/TXT/DOCX） |
| F-09b | 客户端内容提取 + 分块 |
| F-09c | 上下文注入到消息（或复用 RAGFlow） |

**预计文件**: 新增 `app/utils/document-parser.ts`、改动 chat 组件

---

### F-10 — 快捷键增强 (#5135)

**来源**: prd.md  
**优先级**: P2 | **难度**: ⭐ | **价值**: ⭐⭐⭐

| 子任务 | 说明 |
|--------|------|
| F-10a | 定义快捷键映射表（新建会话、切换会话、搜索、设置等） |
| F-10b | 实现全局快捷键监听 hook |
| F-10c | 快捷键提示 UI（设置面板 + tooltip） |

**预计文件**: 新增 `app/hooks/useKeyboard.ts`，改动 `home.tsx`、`settings.tsx`

---

### F-11 — chat.ts Store 拆分 ✅ 已完成

**来源**: 02-02-architecture-review.md 2.8、01-project-analysis.md  
**优先级**: P2 | **难度**: ⭐⭐⭐ | **价值**: ⭐⭐⭐

chat.ts 951 行，混合状态管理 + LLM 调用 + 摘要 + 迁移逻辑。

| 子任务 | 说明 | 状态 |
|--------|------|------|
| F-11a | 提取共享类型为 `store/chat-types.ts` | ✅ |
| F-11b | 提取 LLM 调用逻辑为 `store/chat-actions.ts` | ✅ |
| F-11c | 提取迁移逻辑为 `store/chat-migrations.ts` | ✅ |
| F-11d | chat.ts 仅保留状态定义 + CRUD | ✅ |

**实际结果**: 新增 3 个文件（chat-types.ts、chat-actions.ts、chat-migrations.ts），chat.ts 缩减至 ~250 行

---

### F-12 — 图片上传逻辑统一 ✅ 已完成

**来源**: 02-02-architecture-review.md 2.7  
**优先级**: P3 | **难度**: ⭐⭐ | **价值**: ⭐⭐⭐

当前粘贴/上传/FormData 构建 3 处有重复的 File → base64/Blob 转换逻辑。

| 子任务 | 说明 | 状态 |
|--------|------|------|
| F-12a | 提取 `app/utils/image-upload.ts` 统一处理 | ✅ |
| F-12b | 三处调用方统一使用新工具函数 | ✅ |

**实际结果**: 新增 `cacheBase64Image()` + `IMAGE_CACHE_MAX_SIZE` 常量，`openai.ts` 和 `sd.ts` 消除重复的 base64→Blob→upload 管线

---

### F-13 — API Key 轮询 (#4613)

**来源**: prd.md  
**优先级**: P3 | **难度**: ⭐⭐ | **价值**: ⭐⭐⭐

支持配置多个 API Key，请求时轮询使用以分散限额压力。

| 子任务 | 说明 |
|--------|------|
| F-13a | access store 支持多 key 输入（逗号分隔） |
| F-13b | `resolveAuthHeaderValue()` 实现轮询选择 |
| F-13c | 429 时自动切换 key |

**预计文件**: 改动 `store/access.ts`、`api/auth.ts`

---

### F-14 — 实时语音增强 (#5672/#3110)

**来源**: prd.md、archive/development-plan.md Sprint 5.3  
**优先级**: P3 | **难度**: ⭐⭐⭐⭐⭐ | **价值**: ⭐⭐⭐⭐

| 子任务 | 说明 |
|--------|------|
| F-14a | 上下文发送：把历史消息传给 Realtime API |
| F-14b | 文本显示：实时转录文本同步到聊天界面 |
| F-14c | 错误恢复：断线重连 + 状态恢复 |

**预计文件**: 改动 `components/realtime-chat/`

---

### F-15 — 依赖升级

**来源**: 01-project-analysis.md 6.2  
**优先级**: P3 | **难度**: ⭐⭐⭐ | **价值**: ⭐⭐⭐

| 子任务 | 目标版本 | 风险 |
|--------|---------|------|
| F-15a: TypeScript | 5.2 → 5.7+ | 低 |
| F-15b: ESLint | 8 → 9 (flat config) | 中 |
| F-15c: Zustand | 4.3 → 5.x | 中 |
| F-15d: Next.js + React | 14 → 15 / 18 → 19 | 高（需独立分支） |

---

### F-16 — 安全加固

**来源**: 01-project-analysis.md 八  
**优先级**: P3 | **难度**: ⭐⭐ | **价值**: ⭐⭐⭐

| 子任务 | 说明 |
|--------|------|
| F-16a | 配置 CSP (Content Security Policy) 响应头 |
| F-16b | Rate Limiting（利用现有 `api/upstash/` 端点） |
| F-16c | 集成依赖漏洞扫描（GitHub Dependabot / `npm audit`） |

---

### F-17 — 测试覆盖扩展

**来源**: 02-02-architecture-review.md 三、01-project-analysis.md 七  
**优先级**: P3 | **难度**: ⭐⭐ | **价值**: ⭐⭐⭐

| 子任务 | 覆盖目标 | 当前状态 |
|--------|---------|---------|
| F-17a | 图片编辑 FormData 构建测试 | ❌ 缺失 |
| F-17b | chat store 状态转换测试 | ❌ 缺失 |
| F-17c | 模型过滤逻辑测试 | ❌ 缺失 |
| F-17d | E2E 冒烟测试（Playwright） | ❌ 缺失 |

**目标**: 235 → 300+ 用例

---

## 四、推迟事项追踪

| 事项 | 推迟原因 | 目标阶段 |
|------|---------|---------|
| 虚拟滚动 (react-window) | 与 `msgRenderIndex` 分页集成风险高 | 长期 |
| constant.ts 模型列表动态化 | 大改动风险，当前 CUSTOM_MODELS 机制可用 | 长期 |
| ErrorBoundary 全覆盖 | 当前仅 home/settings/mask 有 | 长期 |

---

## 五、推荐实施路线

### Sprint A — 社区高需求 + 低风险（1–2 周）

| 编号 | 事项 | 预计变更 |
|------|------|---------|
| F-05 | 自定义摘要模型 | 3 文件，+50 行 |
| F-04 | 自定义模型 Vision 声明 | 2 文件，+40 行 |
| F-03 | CUSTOM_MODELS 通配符 | 1 文件 + 测试，+60 行 |
| F-10 | 快捷键增强 | 3 文件，+80 行 |

### Sprint B — 用户体验改善（2–3 周）

| 编号 | 事项 | 预计变更 |
|------|------|---------|
| F-02 | DeepSeek 思考折叠 | 3 文件，+120 行 |
| F-06 | LaTeX 修复 | 1 文件 + 测试，+30 行 |
| F-07 | WebDAV 同步修复 | 2 文件，+150 行 |
| F-12 | 图片上传统一 | 3 文件，+50/-80 行 |

### Sprint C — 架构健康（2 周）

| 编号 | 事项 | 预计变更 |
|------|------|---------|
| F-11 | chat.ts Store 拆分 | 3 文件，±0（内部重组） |
| F-17 | 测试覆盖扩展 | 4 新测试文件，+250 行 |
| F-16 | 安全加固 | 3 文件，+60 行 |

### Sprint D — 高级功能（3–4 周）

| 编号 | 事项 | 预计变更 |
|------|------|---------|
| F-01 | 图片蒙版编辑 | 2 新文件 + 改动 2 文件，+400 行 |
| F-08 | 联网搜索 | MCP 配置 + UI，+200 行 |
| F-09 | 文档问答 | 新工具 + UI，+300 行 |

### Sprint E — 技术升级（3–4 周）

| 编号 | 事项 | 预计变更 |
|------|------|---------|
| F-13 | API Key 轮询 | 2 文件，+80 行 |
| F-14 | 实时语音增强 | realtime-chat 组件，+200 行 |
| F-15 | 依赖升级 | 配置文件，影响全局 |

---

## 六、优先级矩阵总览

```
价值 ↑
  ⭐⭐⭐⭐⭐ │                            F-14(语音)
             │ F-01(蒙版)   F-09(文档)
  ⭐⭐⭐⭐   │ F-08(搜索)   F-07(WebDAV)  F-06(LaTeX)
             │ F-02(思考)   F-03(通配符)
             │ F-05(摘要)   F-04(Vision)
  ⭐⭐⭐     │ F-11(Store)  F-10(快捷键)  F-13(轮询)
             │ F-12(上传)   F-17(测试)    F-16(安全)
  ⭐⭐       │                            F-15(升级)
             └──────────────────────────────────────→ 难度
              ⭐           ⭐⭐⭐         ⭐⭐⭐⭐⭐
```

---

## 七、关键依赖关系

```
F-03 (通配符) ──► F-04 (Vision 声明)   // 语法扩展在同一模块
F-11 (Store 拆分) ──► F-07 (WebDAV)    // sync 依赖 chat store 结构
F-17a (FormData 测试) ──► F-01 (蒙版)  // 测试先行保障蒙版开发
F-08 (联网搜索) ──► F-09 (文档问答)    // 共享上下文注入机制
```

---

## 八、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Next.js 15 升级破坏性变更 | 全局 | F-15d 在独立分支进行，充分回归测试 |
| WebDAV 增量同步数据格式变更 | 用户数据 | F-07 须设计向后兼容迁移，提供回退选项 |
| 蒙版编辑 Canvas 跨浏览器兼容 | 功能完整性 | F-01 使用成熟 Canvas 库（如 fabric.js） |
| chat.ts Store 拆分影响状态迁移 | 数据持久化 | F-11 保持 Zustand persist 键名不变 |
| MCP web-search 安全性 | 注入风险 | F-08 搜索结果需 sanitize 后再注入 |

---

*本计划为滚动规划，每个 Sprint 完成后审查更新。编写日期：2026-04-24。*
