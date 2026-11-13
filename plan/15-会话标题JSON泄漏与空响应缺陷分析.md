# 会话标题 JSON 泄漏与空响应缺陷分析

## 1. 范围与基线

基线提交 `8c490d2d`。本轮处理两个线上缺陷：

1. 会话列表里的会话名称直接显示 JSON 字段（如 `{"id":"chatcmpl-…","object":…`）。
2. 发送图片或进行多轮对话后，助手回复为空，界面报 `empty response` / `empty response from server`。

本文只记录根因和修复方案；实现、验证结果见第 6 节执行记录。

## 2. 证据

- 线上 `/api/config` 返回 `hasCustomBaseUrl: true`、`customModels: ""`：生产走服务端自定义 `BASE_URL`，模型由用户在前端自定义。
- eda 上的 sub2api 网关日志（2026-11-09、11-10，模型 `gpt-6-astra`，`stream: true`）出现：
  `openai_chat_completions.forward_failed … "upstream_error_response_already_written": true, "error": "upstream response failed: Our servers are currently overloaded…"`，而同一请求的访问日志 `status_code` 为 **200**。
  也就是说，兼容网关在已经回了 200 + SSE 头之后，才把上游错误作为一帧 SSE 数据写给客户端。无法确认生产的 `BASE_URL` 就是这台网关，但它证明了这种失败形态真实存在，而前端完全没有处理它（见 3.2）。

## 3. 根因

### 3.1 会话名称出现 JSON

| # | 位置 | 问题 |
| --- | --- | --- |
| T1 | `app/client/platforms/openai.ts` `extractMessage` | 拿不到正文时兜底返回 `JSON.stringify(res)`；`res.error` 时返回包含整段 JSON 的代码块。推理模型的非流式响应经常 `content` 为空或 `null`（正文额度被推理用完、或正文放在 `reasoning`/`reasoning_content`），此时整个响应体被当成"正文"返回。 |
| T2 | `app/store/chat-actions.ts` `summarizeSession` | 只判断 `status === 200` 和 `text.length > 0`，随后 `trimTopic(text)` 直接写入 `session.topic`。`trimTopic` 只去首尾引号和标点，不限制长度，也不识别 JSON/代码块/思考块。T1 的结果因此原样成为会话名。 |
| T3 | `summarizeSession` 标题请求 | 原样把历史消息（含图片数组、`<!--THINKING-->` 思考块、错误消息）发给总结模型；模型名非 `gpt*` 前缀时（如 `openai/gpt-5`、`anthropic/…`）直接用当前推理模型做总结，最容易触发 T1。 |
| T4 | 持久化数据 | 已经写入 IndexedDB 的脏标题不会自愈：自动标题只在 `topic === DEFAULT_TOPIC` 时生成。 |

### 3.2 发送图片 / 多轮对话后空响应

| # | 位置 | 问题 | 与症状的关系 |
| --- | --- | --- | --- |
| E1 | `base.ts` `parseSSE`/`parseSSEWithThink` + `services/chat/stream.ts` | 解析每帧时直接 `json.choices[0]`。上游在 200 流里发送的错误帧 `{"error":{…}}` 没有 `choices`，抛 `TypeError` 后被 `catch` 只打 console，错误内容丢失。流结束时正文为空 → `empty response from server`。 | 第 2 节日志里的过载/处理失败都会表现为"空响应"。大请求（图片、长历史）更容易触发上游失败。 |
| E2 | `openai.ts` `chat()` | 只要模型被识别为视觉模型，就强制 `max_tokens = max(配置, 4000)`；推理/GPT‑5 系模型强制 `max_completion_tokens = 配置 max_tokens`（默认 4000）。新一代推理模型的推理 token 计入这个上限：输入越复杂（图片、长上下文），推理越长，4000 被推理用完，`finish_reason: length`，正文为空。纯文本、非推理路径本来就不发 `max_tokens`，所以简单问题正常。 | **图片**和**多轮**正好是推理量最大的两种输入。这是"发图就空"的主要成因。该 4000 下限是给已下线的 `gpt-4-vision-preview`（默认只输出 16 token）打的补丁。 |
| E3 | `parseSSEWithThink` | 只认 `delta.reasoning_content`，不认 OpenRouter 等使用的 `delta.reasoning`；同一帧同时有推理和正文时丢弃正文；`delta.content` 为数组时 `startsWith` 抛错被吞。 | 推理阶段界面一直是空的；部分正文丢失。 |
| E4 | `stream.ts` `finish()` | 正文为空时既调 `onError("empty response from server")` 又调 `onFinish("")`；不区分用户点击停止、连接超时、上游错误、`finish_reason: length`，一律报同一句话，无法诊断。连接超时固定 60 s，未按模型（推理/图片）放宽。 | 所有空结果都报同一个看不出原因的错误。 |
| E5 | `components/chat.tsx` 打开会话的 `useEffect` | 用 `new Date(m.date)` 解析 `toLocaleString()` 字符串判断消息是否超过 60 s；超时且正文为空就把消息改成 `empty response` 错误并清掉 `streaming`。不看请求是否仍在进行。推理模型（不回传推理过程的网关）首 token 常超过 60 s，用户切走再切回，正在生成的消息会被误判为空响应，随后到达的正文也带着 `isError`。 | 多轮长推理时出现"空响应"，而且这条消息之后会被排除出上下文。 |
| E6 | `utils/indexedDB-storage.ts` + store 水合 | 聊天 store 序列化后只要含 `"streaming":true` 就跳过写入。任意会话残留一个 `streaming:true`（刷新/崩溃中断的请求；E5 只清理当前打开的会话），之后**所有**聊天写入都被跳过，刷新后数据回退。 | 放大 E5 的影响：刷新后看到旧的空消息。 |
| E7 | `getMessagesWithMemory` / `summarizeSession` | 多轮时历史助手消息原样带着 `<!--THINKING-->\n> …<!--/THINKING-->` 推理块回传给模型；记忆总结 `onUpdate` 把带推理块的中间结果直接写进 `memoryPrompt`，作为系统提示注入后续请求。 | 多轮上下文被推理文本膨胀，进一步推高 E2 的推理量，也浪费 token。 |

### 3.3 其他发现（顺带修复）

- `checkMcpJson` 中 `isMcpEnabled()` 是 async，返回的 Promise 恒为真，每条回复都会做 MCP JSON 检测。
- `createPersistStore` 包装 `onRehydrateStorage` 时丢弃了原回调返回的"水合完成"回调，store 无法在水合后做数据修复。

## 4. 修复方案

原则：修根因，不做表面兜底；协议解析和文本清洗放到纯函数里单测；不改 UI 视觉。

### 4.1 标题

1. `extractMessage`：不再把响应体字符串化当作正文。错误响应（`res.error`）由 `chat()` 走 `onError` 并给出可读错误；拿不到正文时返回空字符串。
2. 新增 `app/domain/chat/topic.ts`：
   - `sanitizeTopic(raw)`：去思考块、代码围栏、`Title:` 前缀、引号和尾部标点，取第一行非空文本，截断到 50 字符；JSON/对象形态、空串一律返回 `null`。
   - `looksLikeLeakedTopic(topic)`：识别已持久化的脏标题。
3. `summarizeSession` 标题请求只发送纯文本（去思考块、跳过错误和空消息），结果经 `sanitizeTopic` 校验；无效时保持默认标题，下次再生成。
4. 聊天 store 水合完成后，把脏标题重置为 `DEFAULT_TOPIC`，由下一轮对话自动重新生成。

### 4.2 空响应

1. 新增 `app/domain/chat/sse.ts`，统一解析 OpenAI 兼容流式帧，输出 `{ error, reasoning, content, finishReason, toolCalls, usage }`：
   - 识别顶层 `error`、`choices[0].error`、`finish_reason: "error"`、`event: error`；
   - 兼容 `reasoning_content` / `reasoning`、数组形式的 `content`，同一帧推理与正文都保留；
   - 无 `choices` 的帧（只有 usage）不再报错。
   `base.ts` 的 `parseSSE`/`parseSSEWithThink` 改为基于它实现。
2. `streamWithThink`：
   - 遇到错误帧立即结束，并以上游错误信息调用 `onError`；
   - 正文为空时按原因区分：用户停止（不报错）、连接超时、`finish_reason: length`（提示"输出额度被推理用完"）、其他（附带 finish_reason）；只走 `onError` 一条路径；
   - 连接超时改用 `getTimeoutMSByModel`，与非流式请求一致。
3. `openai.ts`：删除视觉模型强制 `max_tokens ≥ 4000`，以及推理/GPT‑5 模型强制 `max_completion_tokens`。所有对话请求都不再发送输出上限，由上游默认值决定，与纯文本路径一致。`max_tokens` 配置仍用作历史上下文的 token 预算。
4. 发送给模型的历史助手消息剥离 `<!--THINKING-->` 块；记忆总结的中间结果和最终结果同样剥离后再写入 `memoryPrompt`。
5. `chat.tsx` 的过期消息清理改为：消息 `streaming` 且 `ChatControllerPool` 中没有对应活动请求时才视为中断；不再解析本地化日期。
6. 聊天 store 水合完成后清理所有会话中残留的 `streaming: true`（刷新后不存在任何进行中的请求），空正文的中断消息标记为错误，恢复 IndexedDB 写入。
7. `checkMcpJson` 正确 `await isMcpEnabled()`；`createPersistStore` 保留并调用原 `onRehydrateStorage` 返回的回调。

### 4.3 有意的行为变化

- 请求体不再包含 `max_tokens`（视觉模型）和 `max_completion_tokens`（推理/GPT‑5 模型）。
- 多轮请求中，历史助手消息不再携带推理块。
- 空响应的错误文案变为具体原因；用户主动停止且尚无内容时不再显示错误。
- 已损坏的会话名会被重置为"新的聊天"，并在下一轮对话后重新生成。

## 5. 验收

1. 新增单测：SSE 帧解析（错误帧、`reasoning` 别名、推理与正文同帧、数组正文、usage 帧、`finish_reason`）、`streamWithThink` 的错误帧和空结果原因、标题清洗、水合修复、请求体不含输出上限、历史剥离推理块。
2. 更新 `extract-message` 现有用例以匹配新约定。
3. Node 26 Docker：`tsc --noEmit`、`eslint .`、`jest --ci`、`vercel-build`。
4. 线上浏览器验证（发图、多轮、标题生成）需要访问码，作为提交后的人工验收项；在此之前只能标记为"构建/单元验证完成"。

## 6. 执行记录

### 2026-11-13

**新增模块**

- `app/domain/chat/sse.ts`：`parseChatCompletionChunk`、`describeUpstreamError`、`textFromContent`，覆盖 4.2-1 的所有帧形态。
- `app/domain/chat/topic.ts`：`sanitizeTopic`、`looksLikeLeakedTopic`。
- `app/services/chat/response.ts`：`readJsonResponse`（非 2xx、非 JSON、带 `error` 的 2xx 一律抛出可读错误）、`accumulateToolCalls`、`isEmptyOutput`、`emptyOutputError`。
- `app/store/chat-repair.ts`：`settleStaleMessage`、`repairChatSessions`。

**修改**

- `services/chat/stream.ts` 重写 `streamWithThink`：解析器返回 `{ error, reasoning, content, finishReason, usage }`；每个请求只回调 `onFinish`、`onError` 中的一个；空结果按超时、用户停止、`length`、其他四种原因分别报错；连接超时按模型设置；删除未被使用的 `stream()` 包装函数。
- `client/platforms/base.ts`：`parseSSE`/`parseSSEWithThink` 合并为 `parseStreamChunk`；修复流式请求下非流式超时计时器未清除、到点会中断流的问题（RAGFlow 路径）；非流式响应走 `readJsonResponse`；历史助手消息剥离推理块。
- `client/platforms/openai.ts`：`extractMessage` 不再字符串化响应体，错误响应改为抛出；删除 `max_tokens`、`max_completion_tokens`；历史助手消息剥离推理块；非流式空输出报错。
- `store/chat-actions.ts`：标题请求改用 `buildTopicMessages`（纯文本、去推理块、去错误和未完成消息），结果经 `sanitizeTopic` 校验；记忆总结只在完成时写入去除推理块后的文本；`checkMcpJson` 正确 await。
- `store/chat.ts` + `utils/store.ts`：水合完成后执行 `repairChatSessions`；`createPersistStore` 保留原 `onRehydrateStorage` 返回的回调。
- `components/chat.tsx`：打开会话时的清理改为依据 `ChatControllerPool.isActive`（`client/controller.ts` 新增）。
- `locales/cn.ts`、`en.ts`：新增 `Chat.Stream.{Timeout, Length, Empty, HttpError}`。

**测试**

- 新增 `test/chat-sse-chunk.test.ts`（13 例）、`test/stream-with-think.test.ts`（9 例：错误帧、`length`、空流、HTTP 错误、用户停止前后、连接超时、`<think>` 标签）、`test/chat-topic.test.ts`（11 例）、`test/chat-repair.test.ts`（7 例）。
- `test/extract-message.test.ts`：按新约定更新错误、空 choices、非对象响应的期望；新增 `content: null` 不泄漏 JSON、数组正文拼接，以及请求体回归（`gpt-4o`、`o3-mini`、`gpt-5` 不发送输出上限；历史助手消息不含推理块，用户图片仍随请求发送）。

**验证（Node 26 Bookworm Docker）**

- `tsc --noEmit`：通过。
- `eslint .`：0 error；20 个 warning 均位于本轮未修改的文件（`eslint.config.mjs`、`jest.setup.ts`、`next.config.mjs`、`public/serviceWorkerRegister.js`、`scripts/fetch-prompts.mjs`、`test/logger.test.ts`）。
- `jest --ci`：47 个套件、405 个用例、1 个快照全部通过（基线为 43 / 360）。
- `yarn mask && BUILD_MODE=standalone next build --webpack`：构建成功，`app/masks` 生成产物无 git 变更。

**未完成的验收**

- 线上浏览器验证需要访问码，尚未执行。部署后需要确认四项：
  1. 发送图片后能得到正文；
  2. 连续多轮对话不再出现空回复；
  3. 新会话的标题是一行短文本；
  4. 已损坏的旧标题刷新页面后变回"新的聊天"，并在下一轮对话后重新生成。
- 如果上游真的失败，界面会显示具体原因（上游错误文本、超时、`finish_reason`），不再只显示 `empty response`。
