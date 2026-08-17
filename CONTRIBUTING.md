# Contributing

感谢你改进 Qipai Skill。

## 开始开发

要求 Node.js 18+，项目没有第三方运行依赖。

```bash
git clone https://github.com/zenaszou/qipai_skill.git
cd qipai_skill
npm ci
npm test
npm run check
npx playwright install chromium
npm run test:e2e
```

提交前请确保所有测试通过，并避免提交 `.DS_Store`、日志、临时局面或本机配置。

## 修改现有玩法

- 将规则语义写入对应 `qipai/references/*.md`，避免在 `SKILL.md` 重复长篇规则。
- 服务端始终作为合法动作、revision、角色和终局结果的权威来源。
- 非法、重复或过期动作不得消费 revision 或 Agent event。
- 规则修改必须添加能够失败于旧实现的测试。
- 浏览器只使用服务端返回的视图，不自行推导隐藏状态。

## 新增玩法

新增玩法应尽量只扩展注册表、适配器、视图和渲染器，不修改事件桥核心协议。

至少需要：

1. 在 `qipai/scripts/game-registry.mjs` 注册 ID、别名、阵营和适配器。
2. 实现创建会话、合法动作、应用动作、角色视图、终局与必要战术提示。
3. 在 `qipai/assets/app/` 增加对应渲染逻辑。
4. 更新 `qipai/SKILL.md` 的触发别名和路由表。
5. 添加规则、协议、隐私边界和浏览器交互测试。

若玩法包含隐藏信息，浏览器不得收到 Agent 手牌、牌堆顺序或其他私有状态。请分别验证 `human`、`agent` 和 `public` 视图。

## Pull Request

Pull Request 请说明：

- 解决的问题或新增的玩法
- 对协议、规则或 UI 的影响
- 已运行的测试
- 若涉及 UI，更新或附上截图/短视频，并运行真实浏览器 E2E
- 尚未覆盖的边界情况
