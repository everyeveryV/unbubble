# Unbubble

Unbubble 是一个中英双语“开放推荐算法实验台”：用同一组 20 条公开内容，左右并排展示 Engagement Feed 与 Open Feed，允许用户校准立场、调节观点距离、检查排序收据，并 Fork 一份可还原的算法配方。

## 本地运行

无需安装依赖：

```powershell
cd D:\CodexWorkspace\unbubble
npm start
```

## Contract verification

- Network: Monad Testnet (`10143`)
- Contract: `0x700e5c58099e2c2808c577eb161c3631c928ae8f`
- Compiler: Solidity `0.8.30+commit.73712a01` (optimizer disabled, Prague EVM)
- Sourcify job: `7bd0b998-9f17-4972-8777-3484272dfec6`
- Result: exact creation-bytecode match and exact runtime-bytecode match
- Public source: https://repo.sourcify.dev/10143/0x700e5c58099E2C2808c577eb161C3631C928AE8f
- Verification report: https://verify.sourcify.dev/jobs/7bd0b998-9f17-4972-8777-3484272dfec6

打开 `http://127.0.0.1:4174`。

右上角可在中文与 English 之间切换，选择会保存在浏览器中；英文直达链接为 `http://127.0.0.1:4174/?lang=en`。

检查与测试：

```powershell
npm run check
npm test
```

合约已用 Solidity `0.8.30` 编译通过，ABI 与字节码位于 `out/`（该目录默认不提交版本库）。

## Demo 路径

1. 回答 5 个立场判断（也可跳过并使用中立值）。
2. 比较同一候选池在两套排序中的次序差异。
3. 拖动“茧房距离”，查看 Open Feed 和营养标签实时变化。
4. 打开任意卡片的“为什么排这里？”检查逐项排序收据。
5. 切换或编辑三套配方，点击“Fork 并发布”检查链上载荷并导出 JSON。

## 数据与边界

- `data/feed.mjs`：20 条人工策展的公开来源快照、标注与三套配方。
- 所有文章仍链接到原始来源；快照标签是可质疑的输入，不宣称是客观真理。
- 排序完全在浏览器完成，不上传校准答案或阅读历史。
- 实时抓取和 Paste-a-link 不在一日 MVP 范围内。

## Monad 发布

`contracts/OpenFeedRegistry.sol` 在部署时登记三套基础配方，并保存每个 Fork 的父配方、六项可还原权重、内容清单哈希与创建者。文章正文和用户行为不上链。

1. 将合约部署到 Monad Testnet（Chain ID `10143`）。
2. 把地址填入 `src/config.mjs` 的 `REGISTRY_ADDRESS`。
3. 前端会生成标准 ABI calldata；连接钱包后即可发送真实交易。

前端支持真实钱包连接、Monad Testnet 切换、标准 ABI calldata、链上载荷预览与 JSON 导出；在地址未配置时明确禁用发送，不模拟成功交易。

## 目录

```text
unbubble/
├─ contracts/OpenFeedRegistry.sol
├─ data/feed.mjs
├─ src/algorithms.mjs
├─ src/app.mjs
├─ src/config.mjs
├─ test/algorithms.test.mjs
├─ index.html
└─ styles.css
```
