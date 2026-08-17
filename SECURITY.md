# Security Policy

## Supported versions

安全修复仅面向默认分支的最新版本。

## Reporting a vulnerability

请不要为未公开的安全问题创建公开 Issue。优先通过 GitHub Security Advisory 私下报告：

<https://github.com/zenaszou/qipai_skill/security/advisories/new>

报告中请包含影响范围、复现步骤、受影响版本以及可行的缓解建议。维护者会在确认后协调修复与披露。

## Deployment boundary

Qipai Skill 设计为本机工具：

- 服务默认只监听 `127.0.0.1`。
- 不提供身份验证、TLS、互联网暴露或多租户隔离。
- 不应通过端口映射、反向代理或 `--host 0.0.0.0` 直接发布到公网。
- Agent 应把服务端视图作为权限边界，不得从浏览器端暴露未来隐藏信息玩法的私有状态。
