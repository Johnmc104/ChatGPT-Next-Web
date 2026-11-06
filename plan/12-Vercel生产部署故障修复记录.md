# Vercel 生产部署故障修复记录

## 1. 故障结论

2026-11-06 的 [GitHub Actions run 42226275388](https://github.com/Johnmc104/ChatGPT-Next-Web/actions/runs/42226275388) 中，`Lint, test, and build` 已通过；`Deploy Vercel production` 在 `vercel pull` 前失败。日志显示 `VERCEL_TOKEN`、`VERCEL_ORG_ID` 和 `VERCEL_PROJECT_ID` 均为空，Vercel CLI 报 `You defined "--token", but it's missing a value`。仓库和 `Production` environment 当前都没有这三个 Secret。

## 2. 已完成改动

- GitHub Actions 中删除 preview/production 的 Vercel CLI 部署 job，保留 lint、Jest、TypeScript 和 Vercel 构建质量门禁。
- 由已配置的 Vercel Git Integration 负责 `main` 生产部署和 PR Preview，移除 Token、Org ID、Project ID 的 GitHub Secret 依赖。
- 更新 `AGENTS.md`、主版本计划和本记录，保留故障原因、验证证据和后续动作。

## 3. 当前部署链路

代码推送或 PR 更新时，GitHub Actions 先运行质量门禁；Vercel Git Integration 独立创建 Preview 或 Production 部署。两者均执行 Vercel 构建，但只有 Vercel 负责实际发布，避免重复部署。

## 4. 当前状态

代码改动已完成，GitHub Actions 的凭据失败已从流程中移除。现有线上版本检查结果为 `https://chat.johndaily.cn` HTTP 200、`/api/config` HTTP 200；后续以 Vercel Deployment 状态和这两个端点作为发布验收证据。
