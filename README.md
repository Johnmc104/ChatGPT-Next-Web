<div align="center">

<a href='https://nextchat.club'>
  <img src="https://github.com/user-attachments/assets/83bdcc07-ae5e-4954-a53a-ac151ba6ccf3" width="1000" alt="NextChat"/>
</a>

<h1 align="center">NextChat</h1>

English / [简体中文](./README_CN.md)

A lightweight, fast AI assistant supporting **20+ LLM providers** through a unified proxy architecture.

[![Saas][Saas-image]][saas-url]
[![Web][Web-image]][web-url]
[![Windows][Windows-image]][download-url]
[![MacOS][MacOS-image]][download-url]
[![Linux][Linux-image]][download-url]

[NextChatAI](https://nextchat.club?utm_source=readme) / [iOS APP](https://apps.apple.com/us/app/nextchat-ai/id6743085599) / [Web App Demo](https://app.nextchat.club) / [Desktop App](https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web/releases)

[saas-url]: https://nextchat.club\?utm_source\=readme
[saas-image]: https://img.shields.io/badge/NextChat-Saas-green\?logo\=microsoftedge
[web-url]: https://app.nextchat.club/
[download-url]: https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web/releases
[Web-image]: https://img.shields.io/badge/Web-PWA-orange\?logo\=microsoftedge
[Windows-image]: https://img.shields.io/badge/-Windows-blue\?logo\=windows
[MacOS-image]: https://img.shields.io/badge/-MacOS-black\?logo\=apple
[Linux-image]: https://img.shields.io/badge/-Linux-333\?logo\=ubuntu

[<img src="https://vercel.com/button" alt="Deploy on Vercel" height="30">](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FChatGPTNextWeb%2FChatGPT-Next-Web&env=OPENAI_API_KEY&env=CODE&project-name=nextchat&repository-name=NextChat)

</div>

## Features

- **One-click deploy** on Vercel, Docker, or bare metal
- **Compact client** (~5MB) on Linux / Windows / macOS (Tauri)
- **Unified proxy architecture** — a single `BASE_URL` routes all providers through one endpoint (OpenRouter, Cloudflare AI Gateway, etc.)
- **20+ LLM providers**: OpenAI, Azure, Anthropic Claude, Google Gemini, DeepSeek, Baidu ERNIE, ByteDance Doubao, Alibaba Qwen, Tencent Hunyuan, Moonshot, iFlytek Spark, xAI Grok, ChatGLM, SiliconFlow, 302.AI, RAGFlow, Stability AI, and more
- **Privacy first** — all data stored locally in the browser
- **Markdown** with LaTeX, Mermaid, syntax highlighting
- **Artifacts** — preview, copy, and share generated content in a separate window
- **Plugins & MCP** — network search, calculator, and custom tool integrations
- **Realtime Chat** — voice-based conversation support
- **Prompt templates (Masks)** — create, share, and debug chat tools
- **Dark mode & PWA** — responsive design, installable as an app
- **i18n** — 15 languages

<div align="center">

![主界面](./docs/images/cover.png)

</div>

## Quick Start

1. Get an [OpenAI API Key](https://platform.openai.com/account/api-keys) (or any supported provider key)
2. Deploy with one click: [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FChatGPTNextWeb%2FChatGPT-Next-Web&env=OPENAI_API_KEY&env=CODE&project-name=nextchat&repository-name=NextChat)
3. Set `CODE` as your access password

Or use Docker:

```shell
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=sk-xxxx \
  -e CODE=your-password \
  yidadaa/chatgpt-next-web
```

## Architecture

NextChat uses a **unified proxy architecture** where all LLM requests flow through a single server-side proxy:

```
Browser (ChatGPTApi client)
    │
    ▼
/api/{provider}/v1/chat/completions
    │
    ▼
Route Dispatcher ──► Provider Registry (provider.ts)
    │                  Handles: Anthropic, DeepSeek, Google, Stability,
    │                  ByteDance, Alibaba, Moonshot, iFlytek, xAI,
    │                  ChatGLM, SiliconFlow, 302.AI, RAGFlow
    │
    ├── OpenAI / Azure ──► requestOpenai() (GPT-4 filtering, Azure URL rewriting)
    ├── Baidu ──► OAuth token flow (fundamentally different auth)
    ├── Tencent ──► HMAC-SHA256 signing (dedicated route)
    └── default ──► generic proxy pass-through
```

When `BASE_URL` is set, all providers route through the unified proxy instead of their individual upstream URLs.

## Environment Variables

### Core

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key (comma-separated for multiple) |
| `CODE` | No | Access password(s), comma-separated |
| `BASE_URL` | No | Unified proxy URL — routes all providers through one endpoint |
| `PROXY_URL` | No | HTTP proxy for outgoing requests |

### Provider API Keys

| Variable | Provider |
|----------|----------|
| `OPENAI_API_KEY` | OpenAI |
| `AZURE_URL` / `AZURE_API_KEY` / `AZURE_API_VERSION` | Azure OpenAI |
| `GOOGLE_API_KEY` / `GOOGLE_URL` | Google Gemini |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_URL` / `ANTHROPIC_API_VERSION` | Anthropic Claude |
| `BAIDU_API_KEY` / `BAIDU_SECRET_KEY` / `BAIDU_URL` | Baidu ERNIE |
| `BYTEDANCE_API_KEY` / `BYTEDANCE_URL` | ByteDance Doubao |
| `ALIBABA_API_KEY` / `ALIBABA_URL` | Alibaba Qwen |
| `TENCENT_API_KEY` / `TENCENT_SECRET_KEY` / `TENCENT_URL` | Tencent Hunyuan |
| `MOONSHOT_API_KEY` / `MOONSHOT_URL` | Moonshot |
| `IFLYTEK_API_KEY` / `IFLYTEK_API_SECRET` / `IFLYTEK_URL` | iFlytek Spark |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_URL` | DeepSeek |
| `XAI_API_KEY` / `XAI_URL` | xAI Grok |
| `CHATGLM_API_KEY` / `CHATGLM_URL` | ChatGLM |
| `SILICONFLOW_API_KEY` / `SILICONFLOW_URL` | SiliconFlow |
| `AI302_API_KEY` / `AI302_URL` | 302.AI |
| `STABILITY_API_KEY` / `STABILITY_URL` | Stability AI |

### Feature Flags

| Variable | Default | Description |
|----------|---------|-------------|
| `HIDE_USER_API_KEY` | Empty | Set `1` to hide API key input in settings |
| `DISABLE_GPT4` | Empty | Set `1` to block GPT-4 / o1 / o3 models |
| `ENABLE_BALANCE_QUERY` | Empty | Set `1` to allow balance queries |
| `DISABLE_FAST_LINK` | Empty | Set `1` to disable URL-based settings import |
| `ENABLE_MCP` | Empty | Set `true` to enable Model Context Protocol |
| `CUSTOM_MODELS` | Empty | Model list control (see below) |
| `DEFAULT_MODEL` | Empty | Override default model |
| `VISION_MODELS` | Empty | Additional vision-capable models |
| `WHITE_WEBDAV_ENDPOINTS` | Empty | Allowed WebDAV endpoints |
| `DEFAULT_INPUT_TEMPLATE` | Empty | Default user input preprocessing template |

### `CUSTOM_MODELS` Syntax

```
+llama,+claude-2              # Add models
-gpt-3.5-turbo                # Remove models
gpt-4-1106-preview=gpt-4-turbo  # Rename display
-all,+gpt-4                   # Remove all defaults, add specific
+gpt-35@Azure=gpt35           # Azure deployment mapping
+Doubao-lite-4k@bytedance=ep-xxx  # ByteDance endpoint mapping
```

## Development

Requirements: Node.js >= 18, yarn

```shell
# Clone and install
git clone https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web.git
cd ChatGPT-Next-Web
yarn install

# Create .env.local with your API key
echo "OPENAI_API_KEY=sk-xxx" > .env.local

# Run dev server
yarn dev

# Run tests
yarn test
```

## Deployment

### Docker

```shell
# Basic
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=sk-xxxx \
  -e CODE=your-password \
  yidadaa/chatgpt-next-web

# With proxy
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=sk-xxxx \
  -e CODE=your-password \
  -e PROXY_URL=http://localhost:7890 \
  yidadaa/chatgpt-next-web

# With MCP enabled
docker run -d -p 3000:3000 \
  -e OPENAI_API_KEY=sk-xxxx \
  -e CODE=your-password \
  -e ENABLE_MCP=true \
  yidadaa/chatgpt-next-web
```

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FChatGPTNextWeb%2FChatGPT-Next-Web&env=OPENAI_API_KEY&env=CODE&project-name=nextchat&repository-name=NextChat)

### Keep Updated

Fork this repo, then enable **Actions → Upstream Sync** on your fork for automatic hourly updates. See [manual sync docs](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/syncing-a-fork).

## Documentation

| Topic | Link |
|-------|------|
| FAQ | [English](./docs/faq-en.md) / [中文](./docs/faq-cn.md) |
| Cloudflare Pages (Deprecated) | [English](./docs/cloudflare-pages-en.md) |
| Chat Sync (UpStash) | [English](./docs/synchronise-chat-logs-en.md) / [中文](./docs/synchronise-chat-logs-cn.md) |
| Vercel Deploy | [中文](./docs/vercel-cn.md) |
| Translation Guide | [How to add a new translation](./docs/translation.md) |
| Development Plan | [开发计划](./docs/development-plan.md) |
| Project Analysis | [项目分析](./docs/project-analysis.md) |

## Screenshots

![Settings](./docs/images/settings.png)

![More](./docs/images/more.png)

## Contributing

Contributions are welcome! Please read the existing codebase conventions and run `yarn test` before submitting PRs.

## License

[MIT](https://opensource.org/license/mit/)
