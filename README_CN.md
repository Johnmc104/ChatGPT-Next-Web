<div align="center">

<h1 align="center">NextChat</h1>

一键免费部署你的私人 ChatGPT 网页应用，支持 GPT-4/5、Claude、DeepSeek、Gemini、通义千问 等主流大模型。

[演示 Demo](https://chat-gpt-next-web.vercel.app/) / [反馈 Issues](https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web/issues) / [English](./README.md)

[<img src="https://vercel.com/button" alt="Deploy on Vercel" height="30">](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FChatGPTNextWeb%2FChatGPT-Next-Web&env=OPENAI_API_KEY&env=CODE&project-name=nextchat&repository-name=NextChat) [<img src="https://zeabur.com/button.svg" alt="Deploy on Zeabur" height="30">](https://zeabur.com/templates/ZBUEFA)

</div>

## 项目状态

本项目为 [ChatGPTNextWeb/ChatGPT-Next-Web](https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web) 的社区维护分支。原作者已不再活跃维护，当前由社区团队持续开发和维护。

**接手后的主要改进：**
- 认证与代理架构重构，解决频繁出现的 auth/proxy bug
- 组件拆分优化（chat.tsx -42%、settings.tsx -61%）
- 平台客户端抽象基类，新增平台适配仅需 ~20 行
- 性能优化：mermaid/tiktoken 动态加载、fetchWithRetry 重试机制
- 安全加固：日志脱敏、CORS 环境变量化
- 测试体系：113 个测试用例
- 新增功能：Token 用量追踪、成本估算、RAGFlow 知识库支持

详见 [开发计划](./docs/archive/development-plan.md) 和 [工程分析](./docs/01-project-analysis.md)。

## 主要功能

- **一键部署**：Vercel / Docker / 宝塔 一分钟上线
- **多模型支持**：OpenAI (GPT-4/5)、Claude、DeepSeek、Gemini、通义千问、文心一言、讯飞星火、智谱 GLM、Moonshot、SiliconFlow、302.AI、RAGFlow 等 14+ 平台
- **统一代理**：配置 `BASE_URL` 即可通过 OpenRouter / one-api 等统一网关接入所有模型
- **MCP 工具调用**：支持 Model Context Protocol（设置 `ENABLE_MCP=true`）
- **实时语音**：支持 OpenAI / Azure Realtime API
- **隐私优先**：所有数据保存在浏览器本地
- **Markdown**：LaTeX 公式、Mermaid 流程图、代码高亮
- **Token 追踪**：实时用量显示与成本估算
- **Cloudflare AI Gateway**：可选流量走 Cloudflare 代理
- **桌面端**：基于 Tauri，支持 Windows / macOS / Linux
- **PWA**：可作为 Web App 安装

## 快速开始

1. 准备好你的 API Key（OpenAI / Claude / DeepSeek 等均可）；
2. 点击按钮开始部署：
   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FChatGPTNextWeb%2FChatGPT-Next-Web&env=OPENAI_API_KEY&env=CODE&project-name=nextchat&repository-name=NextChat)，记得在环境变量页填入 API Key 和[页面访问密码](#配置页面访问密码) CODE；
3. 部署完毕后，即可开始使用；
4. （可选）[绑定自定义域名](https://vercel.com/docs/concepts/projects/domains/add-a-domain)：Vercel 分配的域名 DNS 在某些区域被污染了，绑定自定义域名即可直连。

<div align="center">
   
![主界面](./docs/images/cover.png)

</div>

## 保持更新

Fork 本项目后，在 Actions 页面启用 **Upstream Sync** Workflow 即可每小时自动同步上游更新。也可手动 [Sync Fork](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/syncing-a-fork)。

## 配置页面访问密码

> 配置密码后，用户需要在设置页手动填写访问码才可以正常聊天，否则会通过消息提示未授权状态。

> **警告**：请务必将密码的位数设置得足够长，最好 7 位以上，否则[会被爆破](https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web/issues/518)。

本项目提供有限的权限控制功能，请在 Vercel 项目控制面板的环境变量页增加名为 `CODE` 的环境变量，值为用英文逗号分隔的自定义密码：

```
code1,code2,code3
```

增加或修改该环境变量后，请**重新部署**项目使改动生效。

## 环境变量

> 本项目大多数配置项都通过环境变量来设置，教程：[如何修改 Vercel 环境变量](./docs/guides/vercel-cn.md)。

### `OPENAI_API_KEY` （必填项）

OpenAI 密钥，你在 openai 账户页面申请的 api key，使用英文逗号隔开多个 key，这样可以随机轮询这些 key。

### `CODE` （可选）

访问密码，可选，可以使用逗号隔开多个密码。

**警告**：如果不填写此项，则任何人都可以直接使用你部署后的网站，可能会导致你的 token 被急速消耗完毕，建议填写此选项。

### `BASE_URL` （可选）

> Default: `https://api.openai.com`

> Examples: `http://your-openai-proxy.com`

OpenAI 接口代理 URL，如果你手动配置了 openai 接口代理，请填写此选项。

> 如果遇到 ssl 证书问题，请将 `BASE_URL` 的协议设置为 http。

### `OPENAI_ORG_ID` （可选）

指定 OpenAI 中的组织 ID。

### `AZURE_URL` （可选）

> 形如：https://{azure-resource-url}/openai

Azure 部署地址。

### `AZURE_API_KEY` （可选）

Azure 密钥。

### `AZURE_API_VERSION` （可选）

Azure Api 版本，你可以在这里找到：[Azure 文档](https://learn.microsoft.com/en-us/azure/ai-services/openai/reference#chat-completions)。

### `GOOGLE_API_KEY` (可选)

Google Gemini Pro 密钥.

### `GOOGLE_URL` (可选)

Google Gemini Pro Api Url.

### `ANTHROPIC_API_KEY` (可选)

anthropic claude Api Key.

### `ANTHROPIC_API_VERSION` (可选)

anthropic claude Api version.

### `ANTHROPIC_URL` (可选)

anthropic claude Api Url.

### `BAIDU_API_KEY` (可选)

Baidu Api Key.

### `BAIDU_SECRET_KEY` (可选)

Baidu Secret Key.

### `BAIDU_URL` (可选)

Baidu Api Url.

### `BYTEDANCE_API_KEY` (可选)

ByteDance Api Key.

### `BYTEDANCE_URL` (可选)

ByteDance Api Url.

### `ALIBABA_API_KEY` (可选)

阿里云（千问）Api Key.

### `ALIBABA_URL` (可选)

阿里云（千问）Api Url.

### `IFLYTEK_URL` (可选)

讯飞星火Api Url.

### `IFLYTEK_API_KEY` (可选)

讯飞星火Api Key.

### `IFLYTEK_API_SECRET` (可选)

讯飞星火Api Secret.

### `CHATGLM_API_KEY` (可选)

ChatGLM Api Key.

### `CHATGLM_URL` (可选)

ChatGLM Api Url.

### `DEEPSEEK_API_KEY` (可选)

DeepSeek Api Key.

### `DEEPSEEK_URL` (可选)

DeepSeek Api Url.

### `RAGFLOW_API_KEY` (可选)

RAGFlow Api Key.

### `RAGFLOW_URL` (可选)

RAGFlow Api Url.

### `CORS_ALLOW_ORIGIN` (可选)

> 默认值：`*`

CORS 允许的来源域名。生产环境建议设置为具体域名以增强安全性。

### `HIDE_USER_API_KEY` （可选）

如果你不想让用户自行填入 API Key，将此环境变量设置为 1 即可。

### `DISABLE_GPT4` （可选）

如果你不想让用户使用 GPT-4，将此环境变量设置为 1 即可。

### `ENABLE_BALANCE_QUERY` （可选）

如果你想启用余额查询功能，将此环境变量设置为 1 即可。

### `DISABLE_FAST_LINK` （可选）

如果你想禁用从链接解析预制设置，将此环境变量设置为 1 即可。

### `WHITE_WEBDAV_ENDPOINTS` (可选)

如果你想增加允许访问的webdav服务地址，可以使用该选项，格式要求：

- 每一个地址必须是一个完整的 endpoint
  > `https://xxxx/xxx`
- 多个地址以`,`相连

### `CUSTOM_MODELS` （可选）

> 示例：`+qwen-7b-chat,+glm-6b,-gpt-3.5-turbo,gpt-4-1106-preview=gpt-4-turbo` 表示增加 `qwen-7b-chat` 和 `glm-6b` 到模型列表，而从列表中删除 `gpt-3.5-turbo`，并将 `gpt-4-1106-preview` 模型名字展示为 `gpt-4-turbo`。
> 如果你想先禁用所有模型，再启用指定模型，可以使用 `-all,+gpt-3.5-turbo`，则表示仅启用 `gpt-3.5-turbo`

用来控制模型列表，使用 `+` 增加一个模型，使用 `-` 来隐藏一个模型，使用 `模型名=展示名` 来自定义模型的展示名，用英文逗号隔开。

在Azure的模式下，支持使用`modelName@Azure=deploymentName`的方式配置模型名称和部署名称(deploy-name)

> 示例：`+gpt-3.5-turbo@Azure=gpt35`这个配置会在模型列表显示一个`gpt35(Azure)`的选项。
> 如果你只能使用Azure模式，那么设置 `-all,+gpt-3.5-turbo@Azure=gpt35` 则可以让对话的默认使用 `gpt35(Azure)`

在ByteDance的模式下，支持使用`modelName@bytedance=deploymentName`的方式配置模型名称和部署名称(deploy-name)

> 示例: `+Doubao-lite-4k@bytedance=ep-xxxxx-xxx`这个配置会在模型列表显示一个`Doubao-lite-4k(ByteDance)`的选项

### `DEFAULT_MODEL` （可选）

更改默认模型

### `VISION_MODELS` (可选)

> 默认值：空
> 示例：`gpt-4-vision,claude-3-opus,my-custom-model` 表示为这些模型添加视觉能力，作为对默认模式匹配的补充（默认会检测包含"vision"、"claude-3"、"gemini-1.5"等关键词的模型）。

在默认模式匹配之外，添加更多具有视觉能力的模型。多个模型用逗号分隔。

### `DEFAULT_INPUT_TEMPLATE` （可选）

自定义默认的 template，用于初始化『设置』中的『用户输入预处理』配置项

### `STABILITY_API_KEY` (optional)

Stability API密钥

### `STABILITY_URL` (optional)

自定义的Stability API请求地址

### `ENABLE_MCP` (optional)

启用MCP（Model Context Protocol）功能

### `SILICONFLOW_API_KEY` (optional)

SiliconFlow API Key.

### `SILICONFLOW_URL` (optional)

SiliconFlow API URL.

### `AI302_API_KEY` (optional)

302.AI API Key.

### `AI302_URL` (optional)

302.AI API URL.

## 开发

在开始写代码之前，需要在项目根目录新建一个 `.env.local` 文件，里面填入环境变量：

```bash
OPENAI_API_KEY=<your api key here>
# 或使用统一代理
BASE_URL=https://your-proxy.com/v1
```

### 本地开发

```bash
# 需要 Node.js >= 18
yarn install && yarn dev
```

### 本地构建

```bash
yarn install && yarn build && yarn start
```

### 运行测试

```bash
yarn test       # watch 模式
yarn test:ci    # CI 模式 + 覆盖率
```

### 项目结构

```
app/
├── api/          # Next.js 服务端 API 路由（auth, proxy, provider 等）
├── client/       # 客户端 API 层（14 个平台适配器 + 基类）
├── components/   # React 组件（chat, settings 等，已模块化拆分）
├── store/        # Zustand 状态管理
├── utils/        # 工具函数（logger, stream, chat 等）
├── mcp/          # MCP (Model Context Protocol) 支持
└── locales/      # 国际化
docs/             # 开发文档
test/             # 测试用例（113 个）
```

详细架构说明见 [工程分析报告](./docs/01-project-analysis.md)。

## 部署

### 宝塔面板部署

> [简体中文 > 如何通过宝塔一键部署](./docs/guides/bt-cn.md)

### 容器部署 （推荐）

> Docker 版本需要在 20 及其以上，否则会提示找不到镜像。


```shell
docker pull chatgptnextweb/chatgpt-next-web

docker run -d -p 3000:3000 \
   -e OPENAI_API_KEY=sk-xxxx \
   -e CODE=页面访问密码 \
   chatgptnextweb/chatgpt-next-web
```

你也可以指定 proxy：

```shell
docker run -d -p 3000:3000 \
   -e OPENAI_API_KEY=sk-xxxx \
   -e CODE=页面访问密码 \
   --net=host \
   -e PROXY_URL=http://127.0.0.1:7890 \
   chatgptnextweb/chatgpt-next-web
```

如需启用 MCP 功能，可以使用：

```shell
docker run -d -p 3000:3000 \
   -e OPENAI_API_KEY=sk-xxxx \
   -e CODE=页面访问密码 \
   -e ENABLE_MCP=true \
   chatgptnextweb/chatgpt-next-web
```

如果你的本地代理需要账号密码，可以使用：

```shell
-e PROXY_URL="http://127.0.0.1:7890 user password"
```

如果你需要指定其他环境变量，请自行在上述命令中增加 `-e 环境变量=环境变量值` 来指定。

### 本地部署

在控制台运行下方命令：

```shell
bash <(curl -s https://raw.githubusercontent.com/ChatGPTNextWeb/ChatGPT-Next-Web/main/scripts/setup.sh)
```

⚠️ 注意：如果你安装过程中遇到了问题，请使用 docker 部署。

## 相关项目

- [one-api](https://github.com/songquanpeng/one-api): 一站式大模型额度管理平台，支持市面上所有主流大语言模型
- [OpenRouter](https://openrouter.ai/): 统一 AI 模型网关

## 开源协议

[MIT](https://opensource.org/license/mit/)
