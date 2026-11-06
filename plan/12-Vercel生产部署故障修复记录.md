# Vercel 生产部署故障修复记录

## 1. 故障结论

2026-11-06 的 [GitHub Actions run 42226275388](https://github.com/Johnmc104/ChatGPT-Next-Web/actions/runs/42226275388) 中，`Lint, test, and build` 已通过；`Deploy Vercel production` 在 `vercel pull` 前失败。日志显示 `VERCEL_TOKEN`、`VERCEL_ORG_ID` 和 `VERCEL_PROJECT_ID` 均为空，Vercel CLI 报 `You defined "--token", but it's missing a value`。仓库和 `Production` environment 当前都没有这三个 Secret。

## 2. 已完成改动

- 生产 job 显式使用现有的 GitHub `Production` environment。
- preview 和 production job 都增加部署前凭据检查，缺少 Secret 时直接给出缺失名称和配置位置。
- 更新 `AGENTS.md`、主版本计划和本记录，保留故障原因、验证证据和后续动作。

## 3. 恢复部署所需动作

在 GitHub 仓库 `Settings → Environments → Production`（或 repository secrets）配置：

```text
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

其中 token 使用 Vercel Personal Access Token，两个 ID 使用目标 Vercel 项目的 team/org 与 project ID。配置后重新运行 workflow；质量 job 通过后，production job 才会执行 `vercel pull`、`vercel build --prod` 和 `vercel deploy --prebuilt --prod`。

## 4. 当前状态

代码改动已完成，尚未宣称部署恢复。待 Secret 配置后，以新的 GitHub Actions 结果和 `https://chat.johndaily.cn` HTTP 200、`/api/config` HTTP 200 作为验收证据。
