<div align="center">

<h1 align="center">NextChat</h1>

可自行部署的多模型 AI 对话网页应用，部署在 Vercel，通过 OpenAI 兼容接口接入各类大模型。

[使用指南](./docs/user-guide.md) / [常见问题](./docs/faq.md) / [反馈 Issues](https://github.com/Johnmc104/ChatGPT-Next-Web/issues)

[<img src="https://vercel.com/button" alt="Deploy on Vercel" height="30">](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FJohnmc104%2FChatGPT-Next-Web&env=OPENAI_API_KEY&env=CODE&project-name=nextchat&repository-name=NextChat)

![主界面](./docs/images/cover.png)

</div>

## 简介

本项目最初从 [ChatGPTNextWeb/ChatGPT-Next-Web](https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web)（MIT）分叉，之后独立演进，不再同步上游。只支持 Web 部署；桌面客户端和静态导出已移除。

## 功能

- **多模型**：通过 `BASE_URL` 接入任意 OpenAI 兼容网关（OpenRouter、one-api 等）；另外内置 Azure OpenAI、Stability 绘图和 RAGFlow 知识库。
- **自定义模型**：支持后端模型名与展示名映射，在服务端和设置页都可以配置。
- **图片**：支持图片上传和识图（PNG/JPEG/WebP/HEIC），以及 DALL·E、gpt-image 等图片生成模型。
- **推理模型**：推理过程可折叠显示，不会在后续请求中重复发送。
- **访问控制**：支持访问码；服务端 Key 不会被转发到用户自定义的地址。
- **工具**：插件（OpenAPI）、MCP（`ENABLE_MCP=true`）、Artifacts 预览与分享。
- **长对话**：历史摘要压缩，以及 Token 用量与成本估算。
- **本地优先**：对话数据保存在浏览器 IndexedDB 中，可选 WebDAV/Upstash 同步。
- **Markdown**：支持 LaTeX、Mermaid、代码高亮；可作为 PWA 安装。

## 部署

### Vercel（推荐）

1. 点击上方 **Deploy on Vercel**，或 Fork 本仓库后在 Vercel 中导入；
2. 在环境变量中至少填写 `OPENAI_API_KEY`；强烈建议同时设置访问码 `CODE`；如果使用其他网关，填写 `BASE_URL`；
3. 部署完成后即可使用。之后推送到 `main`，Vercel 会自动重新部署；修改环境变量后需要手动 Redeploy。

部分地区访问 Vercel 默认域名不稳定，可以[绑定自定义域名](https://vercel.com/docs/projects/domains/add-a-domain)。

### Docker 自托管

本仓库不发布镜像，请用仓库中的 `Dockerfile` 构建：

```shell
git clone https://github.com/Johnmc104/ChatGPT-Next-Web.git
cd ChatGPT-Next-Web
docker build -t nextchat .
docker run -d -p 3000:3000 -e OPENAI_API_KEY=sk-xxxx -e CODE=访问码 nextchat
```

也可以使用 Docker Compose。先把 `.env.template` 复制为 `.env` 并填写，然后运行：

- 直连：`docker compose --profile no-proxy up -d --build`
- 走代理：`docker compose --profile proxy up -d --build`，并在 `.env` 中设置 `PROXY_URL`（如 `http://127.0.0.1:7890`；需要账号密码时写成 `"http://127.0.0.1:7890 user password"`）

## 环境变量

完整列表和说明见 [`.env.template`](./.env.template)。它是唯一的环境变量模板，有测试保证它与代码保持一致。

| 变量 | 说明 |
| --- | --- |
| `OPENAI_API_KEY` | 服务端 API Key。多个 Key 用英文逗号分隔，每次请求随机选用一个 |
| `BASE_URL` | 上游地址，默认 `https://api.openai.com`，可填任意 OpenAI 兼容网关 |
| `CODE` | 访问码，多个用英文逗号分隔。**公开部署务必设置**，否则任何人都能消耗你的额度；访问码要足够长 |
| `HIDE_USER_API_KEY` | 设为 `1` 时，禁止用户使用自己的 Key |
| `CUSTOM_MODELS` | 增加（`+name`）、隐藏（`-name`、`-all`）或重命名（`name=展示名`）模型，用逗号分隔。Azure 部署写作 `name@Azure=部署名`；可选的 `#内部名` 后缀用于匹配定价与能力元数据，例如 `+gpt-mine@OpenAI=我的GPT#openai/gpt-4o` |
| `DEFAULT_MODEL` | 新对话的默认模型 |
| `VISION_MODELS` | 在内置识别规则之外，额外标记为支持图片输入的模型 |
| `DISABLE_GPT4` / `DISABLE_FAST_LINK` / `ENABLE_BALANCE_QUERY` | 隐藏 GPT-4 类模型 / 禁用链接预填设置 / 开启余额查询 |
| `AZURE_URL`、`AZURE_API_KEY`、`AZURE_API_VERSION` | Azure OpenAI（`AZURE_URL` 形如 `https://{resource}/openai`） |
| `STABILITY_URL`、`STABILITY_API_KEY` | Stability 绘图 |
| `RAGFLOW_URL`、`RAGFLOW_API_KEY` | RAGFlow 知识库。`/api/ragflow` 只会转发到 `RAGFLOW_URL` |
| `ENABLE_MCP` | 设为 `true` 启用 MCP |
| `WHITE_WEBDAV_ENDPOINTS` | 额外允许的 WebDAV 同步地址 |
| `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_KV_NAMESPACE_ID`、`CLOUDFLARE_KV_API_KEY`、`CLOUDFLARE_KV_TTL` | Artifacts 分享使用的 Cloudflare KV |
| `GA_ID`、`GTM_ID` | Google Analytics / Tag Manager |
| `CORS_ALLOW_ORIGIN` | `/api` 的 CORS 允许来源，默认 `*`，生产环境建议设为具体域名（在 `next.config.mjs` 中读取） |

## 开发

需要 Node.js 26 和 Yarn 1.22.19（见 `.nvmrc`、`package.json`）。

```shell
cp .env.template .env.local   # 填写 OPENAI_API_KEY 等
yarn install
yarn dev                      # 开发服务器
yarn lint                     # ESLint
yarn test:ci                  # Jest + 覆盖率
./node_modules/.bin/tsc --noEmit
yarn vercel-build             # 与 Vercel 相同的生产构建
```

GitHub Actions 会对 PR 和 `main` 运行 lint、Jest、TypeScript 检查和生产构建，发布由 Vercel Git Integration 负责。代码风格和提交约定见 [AGENTS.md](./AGENTS.md)。

### 目录结构

```
app/
├── api/          # 服务端路由：统一入口 [provider]、代理、鉴权、图片生成、同步等
├── client/       # 客户端协议层：OpenAI 兼容客户端 + RAGFlow
├── domain/       # 纯业务逻辑：鉴权、对话流解析、端点、模型、消息
├── services/     # 有副作用的服务：对话流、图片缓存、端点测试
├── components/   # React 组件
├── store/        # Zustand 状态（IndexedDB 持久化）
├── utils/        # 工具函数
├── mcp/          # MCP 支持
└── locales/      # 中英文文案
docs/             # 使用指南与常见问题
plan/             # 迭代计划、分析报告与验收记录
public/           # 静态资源（含内置插件描述）
test/             # Jest 测试
```

架构说明见 [`plan/16`](./plan/16-代码清理与架构功能分析报告.md)，工程约定见 [`plan/17`](./plan/17-工程与源码文件管理审查报告.md)。

## 许可

[MIT](./LICENSE)。保留原项目的版权声明。
