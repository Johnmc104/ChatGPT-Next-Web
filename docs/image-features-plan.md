# 图片功能增强方案评估

## 目录

1. [已完成功能汇总](#已完成功能汇总)
2. [Feature 3: partial_images 流式预览](#feature-3-partial_images-流式预览)
3. [Feature 4: 图片编辑 (Image Edits)](#feature-4-图片编辑-image-edits)
4. [补充: 图片上传现状与问题分析](#补充-图片上传现状与问题分析)
5. [实施路线图](#实施路线图)

---

## 已完成功能汇总

### 基础图片生成修复 & 增强（已提交）

| Commit | 功能 | 关键改动 |
|--------|------|----------|
| `77a5394b` | 图片模型路由修复 | 所有 image model 走 `/v1/images/generations` |
| `ba1d6cf9` | Model Capabilities 系统 | `isImageModel()` / `isVisionModel()` 能力检测 + 缓存 |
| `510876e3` | output_format 支持 | GPT Image 用 `output_format` 取代 `response_format` |
| `9523e366` | quality 值重映射 | DALL-E `standard→auto`, `hd→high` 映射 |
| `7417ec2b` | extractMessage 防御性修复 | 修复 `TypeError: e.content is not iterable` |
| `d0441214` | SSE 心跳保活 | `X-Stream-Heartbeat` + 15s `: heartbeat` 机制 |
| `b58c8f38` | 专用 image-gen 端点 | `/api/image-gen` Node.js runtime, maxDuration=60 |
| `637c6d06` | maxDuration 修正 | Node.js runtime 正确配置 |
| `4ca744cb` | 输出格式选择器 | png/jpeg/webp + output_compression |
| `22743d34` | 统一图片配置面板 | Size/Quality/Format/Style chip 选择器合并为单个弹窗 |

### Phase 1: 图片编辑基础支持（已实现，本次提交）

| 文件 | 改动 | 状态 |
|------|------|------|
| `app/constant.ts` | 新增 `ImageEditPath: "v1/images/edits"` | ✅ |
| `app/components/chat-actions.tsx` | 上传按钮对 image model 可见 | ✅ |
| `app/client/platforms/openai.ts` | `isImageEdit` 检测 + FormData 构建 + `/api/image-edit` 路由 | ✅ |
| `app/api/image-edit/route.ts` | 新建 Node.js 端点, multipart 转发, SSE heartbeat | ✅ |

**工作原理**:
1. 用户在 GPT Image 模型下粘贴/上传图片 + 输入编辑指令
2. 客户端检测 `isImageModel && attachImages.length > 0` → `isImageEdit = true`
3. 构建 FormData（image blob + prompt + model + size + quality + output_format）
4. POST `/api/image-edit` → 服务端转发 multipart/form-data 到上游 `/v1/images/edits`
5. 响应经 SSE heartbeat 包装返回，客户端解析并显示编辑后图片

### 待实现功能

| Phase | 功能 | 状态 |
|-------|------|------|
| Phase 2 | partial_images 流式预览 | ❌ 未开始 |
| Phase 3 | Mask 蒙版编辑 + 多轮编辑 | ❌ 未开始 |

---

## Feature 3: partial_images 流式预览

### 3.1 功能目标

在 GPT Image 模型生成图片时，通过 `partial_images` 参数获取 0-3 张渐进式预览图，在聊天界面实时显示生成进度，大幅提升等待体验。

### 3.2 OpenAI API 规格

**请求**（Image API `POST /v1/images/generations`）:

```json
{
  "model": "gpt-image-2",
  "prompt": "...",
  "partial_images": 2,
  "output_format": "png",
  "quality": "auto",
  "size": "1024x1024"
}
```

**响应**: SSE 流式事件

```
event: ImageGenPartialImageEvent
data: {"type":"partial_image","partial_image_index":0,"b64_json":"...低分辨率预览...","background":"opaque","created_at":...,"output_format":"png","quality":"auto","size":"1024x1024"}

event: ImageGenPartialImageEvent
data: {"type":"partial_image","partial_image_index":1,"b64_json":"...中分辨率预览...","background":"opaque",...}

event: ImageGenCompletedEvent
data: {"type":"completed","b64_json":"...完整图片...","revised_prompt":"...","background":"opaque",...}
```

- `partial_images: 0` = 仅返回最终图（当前行为）
- `partial_images: 1-3` = 返回 N 张渐进预览 + 最终图
- 每张 partial image 额外消耗 100 output tokens
- 如果生成速度快，可能收到少于请求数量的 partial images

### 3.3 当前架构分析

```
Client (openai.ts)                    Server (image-gen/route.ts → common.ts)
─────────────────                    ────────────────────────────────────────
1. Build payload (shouldStream=false)
2. Set X-Stream-Heartbeat: 1
3. POST /api/image-gen          ───►  4. Rewrite to /api/openai/v1/images/generations
                                      5. requestOpenai() → upstream OpenAI
                                      6. Heartbeat wrapper: collect FULL body,
                                         then emit as single SSE data event
                                ◄───  7. Return: `: heartbeat\n\ndata: {json}\n\ndata: [DONE]\n\n`
8. Parse SSE, extract JSON
9. extractMessage() → cache b64 → display
```

**关键问题**: 当前 heartbeat wrapper (common.ts L220-285) 会**收集完整的 upstream body** 后一次性发送。如果 upstream 是 SSE 流（partial_images 场景），当前实现会**丢失流式特性**，把所有事件拼成一个大 payload。

### 3.4 改动方案

#### 层级 1: 服务端代理 (`app/api/common.ts` / `app/api/image-gen/route.ts`)

| 改动点 | 说明 |
|--------|------|
| 新增 `X-Stream-Partial` header 检测 | 区分普通 heartbeat 包装 vs 流式转发 |
| 流式转发模式 | 当 upstream 返回 `text/event-stream` 时，逐事件读取并原样转发（附加 heartbeat） |
| Heartbeat 降级兼容 | 如果 upstream 不是 SSE（旧 API / 其他模型），回退到当前的全量收集模式 |

```
// 伪代码: 流式转发
if (upstreamContentType === "text/event-stream") {
  // 直接管道: upstream SSE → 添加定期 heartbeat → 下发 client
  pipe(upstream, client, { heartbeatInterval: 15000 });
} else {
  // 旧逻辑: 收集全量 → 打包为 SSE
  collectAndWrap(upstream, client);
}
```

#### 层级 2: 客户端请求 (`app/client/platforms/openai.ts`)

| 改动点 | 说明 |
|--------|------|
| payload 增加 `partial_images` 字段 | 仅 GPT Image 模型，值 = 2（默认，或从 config 读取） |
| SSE 解析改为增量式 | 现有解析 (L590-603) 是 `await res.text()` 一次性读取。需改为 `ReadableStream` 逐行解析 |
| 每收到 partial event → 调用 `onUpdate()` | 更新 `botMessage.content` 为当前预览图 |
| 收到 completed event → 调用 `onFinish()` | 缓存最终图到 ServiceWorker |

```typescript
// 伪代码: 客户端增量 SSE 解析
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });

  // 按 \n\n 切分 SSE 事件
  while (buffer.includes("\n\n")) {
    const [event, rest] = splitFirst(buffer, "\n\n");
    buffer = rest;

    if (event.startsWith(": heartbeat")) continue;
    if (event.startsWith("data: [DONE]")) break;

    const json = JSON.parse(event.replace("data: ", ""));
    if (json.type === "partial_image") {
      // 创建临时 blob URL 显示预览
      const blobUrl = URL.createObjectURL(base64Image2Blob(json.b64_json));
      options.onUpdate(blobUrl); // → botMessage.content 更新 → UI 重渲染
    } else if (json.type === "completed" || json.data) {
      // 最终图 → 正常 extractMessage() 流程
      finalJson = json;
    }
  }
}
```

#### 层级 3: 聊天 store (`app/store/chat.ts`)

| 改动点 | 说明 |
|--------|------|
| `onUpdate(message)` 已支持更新 `botMessage.content` | 现有逻辑可直接用 |
| 需要让 `onUpdate` 接收 `MultimodalContent[]` | 当前 `onUpdate` 只处理 string，需扩展 |

#### 层级 4: UI 显示 (`app/components/chat.tsx`)

| 改动点 | 说明 |
|--------|------|
| 已有 `getMessageImages(message)` 渲染图片 | **无需改动** — 只要 `botMessage.content` 被正确设为 `MultimodalContent[]`，现有渲染逻辑自动生效 |
| 可选: 添加模糊/渐进过渡效果 | CSS transition 让 partial → final 切换更平滑 |
| 可选: 进度指示器 | 显示 "生成中 (1/3)" 之类的文字 |

### 3.5 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Vercel AI Gateway 是否透传 SSE | 如果 gateway 缓冲 SSE，partial 会被攒到一起 | 需实测；如不支持可降级为 heartbeat 模式 |
| OpenRouter 不支持 `partial_images` | OpenRouter 用户无法使用此功能 | 检测非 OpenAI 直连时跳过 `partial_images` |
| partial image base64 体量大 | 每张 partial 可能 1-5MB | 使用 Blob URL 而非 data URI，用完及时 revoke |
| 内存峰值 | 3 partial + 1 final = 4 张大图同时在内存 | 收到新 partial 时 revoke 前一个的 blob URL |
| Cloudflare 代理缓冲 | CDN 可能缓冲 SSE 导致 partial 延迟到达 | 已有 heartbeat 机制，且 `Content-Type: text/event-stream` 通常不被缓冲 |

### 3.6 工作量评估

| 组件 | 预估工作量 |
|------|-----------|
| common.ts 流式转发 | 中 (改 heartbeat wrapper 为双模式) |
| openai.ts SSE 增量解析 | 中 (最核心改动) |
| chat.ts onUpdate 支持 MultimodalContent | 小 |
| 配置项 & UI (partial_images 数量选择) | 小 |
| 测试 (mock SSE stream) | 中 |
| **总计** | **中等偏大** |

---

## Feature 4: 图片编辑 (Image Edits)

### 4.1 功能目标

支持用户上传一张或多张参考图片，配合文字提示让 GPT Image 模型编辑/合成图片。支持可选的 mask（蒙版）局部编辑。

### 4.2 OpenAI API 规格

**端点**: `POST /v1/images/edits` (multipart/form-data)

```
image[]: <file>           # 一张或多张参考图 (必需)
prompt: "..."             # 编辑指令 (必需)
mask: <file>              # 可选蒙版 (PNG with alpha channel)
model: "gpt-image-2"     # 模型
n: 1                      # 生成数量
size: "1024x1024"        # 输出尺寸
quality: "auto"
output_format: "png"
```

**响应**: 与 `/generations` 相同格式

```json
{
  "created": 1234567890,
  "data": [{ "b64_json": "..." }]
}
```

**关键差异**:
- **multipart/form-data** 而非 JSON — 需要组装 FormData
- 图片以文件形式发送，非 base64 字符串
- 支持多张参考图 (`image[]` 数组)
- mask 需要 PNG + alpha channel

### 4.3 当前架构与适配路径

#### 图片输入已有的基础设施

| 组件 | 现状 | 复用度 |
|------|------|--------|
| 图片粘贴 (paste handler) | ✅ 支持 `image/*` 类型 | 高 — 可直接复用 |
| 图片上传按钮 | ✅ 有 `<input type="file">` | 高 — 可直接复用 |
| ServiceWorker 缓存 | ✅ 缓存上传图为 `/api/cache/{id}.{ext}` URL | 高 — 已有缓存机制 |
| `attachImages` 状态 | ✅ `chat.tsx` 维护 `attachImages[]` | 高 — 需扩展用途 |
| `preProcessImageContent()` | ✅ 将 SW 缓存 URL → base64 data URL | 高 — 需改为获取原始 Blob |
| Vision model 检测 | ⚠️ `isVisionModel()` 控制上传按钮显示 | 需扩展: image gen 模型也显示上传按钮 |

#### 需要新增的部分

| 组件 | 说明 |
|------|------|
| **请求路由判断** | 检测 `attachImages.length > 0 && isImageModel` → 走 `/images/edits` 而非 `/images/generations` |
| **FormData 构建** | 将 base64/SW-cached 图片转为 `File` 对象，组装 multipart |
| **新 API 端点** | `app/api/image-edit/route.ts` (Node.js runtime, 类似 image-gen) |
| **常量定义** | `OpenaiPath.ImageEditPath = "v1/images/edits"` |
| **上传按钮扩展** | GPT Image 模型也显示上传/粘贴按钮（当前仅 vision 模型显示） |

### 4.4 改动方案

#### 方案 A: 最小改动 — 复用现有上传 + 自动路由

**核心思路**: 用户在 GPT Image 模型下粘贴/上传图片后发送，系统自动判断走 edits 还是 generations。

```
用户操作流程:
1. 选择 gpt-image-2 模型
2. 粘贴/上传一张图片（显示在输入框预览区）
3. 输入编辑指令："把背景改成海滩"
4. 点击发送
5. 系统检测到 attachImages + isImageModel → 走 /images/edits
6. 编辑后的图片显示在聊天中
```

##### 层级 1: 上传按钮可见性 (`app/components/chat-actions.tsx`)

```diff
- const show = isVisionModel(currentModel);
+ const show = isVisionModel(currentModel) || isImageModel(currentModel);
```

##### 层级 2: 请求路由 (`app/client/platforms/openai.ts`)

```typescript
if (isImageGen) {
  const hasAttachedImages = options.messages.slice(-1)?.[0]?.content
    ?.some?.(c => c.type === "image_url");

  if (hasAttachedImages) {
    // → /images/edits (multipart/form-data)
    await this.imageEdit(options);
  } else {
    // → /images/generations (JSON)
    // 现有逻辑
  }
}
```

##### 层级 3: 新方法 `imageEdit()` (`app/client/platforms/openai.ts`)

```typescript
async imageEdit(options: ChatOptions) {
  const lastMessage = options.messages.slice(-1)[0];
  const text = getMessageTextContent(lastMessage);
  const imageUrls = getMessageImages(lastMessage);

  const formData = new FormData();
  formData.append("model", options.config.model);
  formData.append("prompt", text);
  formData.append("n", "1");
  formData.append("size", options.config.size ?? "1024x1024");
  formData.append("output_format", options.config.outputFormat ?? "png");
  formData.append("quality", mapQuality(options.config));

  // 将图片 URL (ServiceWorker cache / data URI) 转为 File
  for (const url of imageUrls) {
    const blob = await fetchImageAsBlob(url);
    formData.append("image[]", blob, `image.png`);
  }

  const res = await fetch("/api/image-edit", {
    method: "POST",
    headers: { /* auth headers */ },
    body: formData,
  });

  const json = await res.json();
  const result = await this.extractMessage(json);
  options.onFinish(result, res);
}
```

##### 层级 4: 服务端端点 (`app/api/image-edit/route.ts`)

```typescript
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  // Auth check
  // 转发 multipart/form-data to upstream
  // 返回 JSON response
}
```

##### 层级 5: 常量

```typescript
// app/constant.ts
export const OpenaiPath = {
  // ...
  ImageEditPath: "v1/images/edits",
};
```

#### 方案 B: 专用编辑模式 UI（后期增强）

增加专门的"编辑模式"切换按钮，支持 mask 绘制等高级功能。此方案 UI 复杂度高，建议作为后续迭代。

### 4.5 风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| multipart/form-data 通过 proxy | 当前 proxy (common.ts) 假设 JSON body | image-edit 端点单独处理，不走 requestOpenai() |
| 图片大小限制 | OpenAI 限制 < 50MB per file | 前端压缩 + 提示 |
| Mask 功能 | 需要 canvas 绘制蒙版 UI | Phase 1 不实现 mask，后续迭代 |
| GPT Image 模型既是 image gen 又需要 vision 输入 | `isVisionModel()` 和 `isImageModel()` 检测可能冲突 | 用 `isImageModel` 扩展上传按钮可见性，路由逻辑在 chat 方法中判断 |
| ServiceWorker 缓存 URL 可能过期 | 长时间未发送的图片可能被 LRU 淘汰 | `preProcessImageContent` 已处理: 会 fetch → base64 |

### 4.6 工作量评估

| 组件 | 预估工作量 |
|------|-----------|
| 上传按钮可见性扩展 | 小 (1行改动) |
| imageEdit() 方法 + FormData 构建 | 中 |
| image-edit/route.ts 端点 | 中 (需处理 multipart 转发) |
| 常量 + 路由判断 | 小 |
| 测试 | 中 |
| **Phase 1 总计** | **中等** |
| Mask UI (Phase 2) | 大 |

---

## 补充: 图片上传现状与问题分析

### 当前实现

```
用户粘贴/上传 → uploadImageRemote()
  ├─ SW 可用 → POST /api/cache/upload → ServiceWorker 拦截 → CacheStorage 存储 → 返回 /api/cache/{id}.ext
  └─ SW 不可用 → compressImage() → base64 data URI

发送消息时:
  attachImages[] → MultimodalContent[{ type: "image_url", image_url: { url } }]
  ↓
  preProcessImageContent() → 将 SW 缓存 URL → base64 data URL (压缩到 256KB)
  ↓
  发送到 API
```

### 已知问题

1. **上传按钮仅 Vision 模型显示** — `isVisionModel(currentModel)` 控制，GPT Image 模型下看不到上传按钮
2. **3 张图片上限** — `images.splice(3, ...)` 硬编码为 3 张，编辑场景可能不够
3. **压缩到 256KB** — `preProcessImageContent` 压缩较激进，编辑场景需要高保真原图
4. **ServiceWorker 注册失败** — 某些浏览器/环境下 SW 不可用，回退到 base64 可能有兼容问题

### 图片编辑适配改动

| 问题 | 解决方案 |
|------|----------|
| 上传按钮不显示 | `isVisionModel(model) \|\| isImageModel(model)` |
| 3 张图限制 | Image 模型扩大到 5 张 |
| 256KB 压缩 | Image edits 路径跳过压缩，直接发送原始 Blob |

---

## 实施路线图

### Phase 1: 图片编辑基础支持 ✅ 已完成

已实现并提交。详见上方"已完成功能汇总"。

**后续优化**: 单元测试 (`test/image-edit.test.ts`)、图片大小限制提示、编辑路径跳过 256KB 压缩。

### Phase 2: partial_images 流式预览 ← 当前阶段

**理由**: 涉及 SSE 管道改造，需要更仔细的实测验证（尤其是 Vercel AI Gateway 和 Cloudflare 透传问题）。

| 步骤 | 文件 | 说明 |
|------|------|------|
| 1 | `app/api/common.ts` | Heartbeat wrapper 支持 SSE 透传模式 |
| 2 | `app/client/platforms/openai.ts` | payload 增加 `partial_images`，SSE 增量解析 |
| 3 | `app/store/chat.ts` | `onUpdate` 支持 `MultimodalContent[]` |
| 4 | `app/components/chat.tsx` | 可选: 渐进过渡动画 |
| 5 | 配置 & UI | `partial_images` 数量选择（在 image config panel 中） |
| 6 | 实测 | Vercel / Cloudflare SSE 透传验证 |

### Phase 3: 高级编辑（后续迭代）

- Mask 蒙版绘制 UI (canvas)
- 多轮编辑（前一张生成图作为下一次输入）
- `input_fidelity` 参数支持
