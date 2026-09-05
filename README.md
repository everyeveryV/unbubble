# Unbubble

> 用开放 Feed 算法打破信息茧房。

[在线体验](https://unbubble-nu.vercel.app) · [Monad 测试网合约](https://testnet.monadscan.com/address/0x700e5c58099e2c2808c577eb161c3631c928ae8f) · [Sourcify 验证源码](https://repo.sourcify.dev/10143/0x700e5c58099E2C2808c577eb161C3631C928AE8f)

## 项目概述

Unbubble 是一个中英双语的开放推荐算法实验台。它把同一组 20 条公开内容分别交给 **Engagement Feed** 与 **Open Feed** 排序，让用户直观看见：即使输入内容完全相同，不同推荐规则仍会塑造截然不同的信息世界。

用户可以校准自己的立场、调节希望接触的观点距离、查看每条内容的排序依据，并复制、修改和发布一份可验证的算法配方。项目不进行注意力挖矿，也不会把文章正文、浏览记录或用户立场上传到链上。

## 主要功能

- **同池双 Feed 对比**：两侧使用完全相同的 20 条内容，只改变排序算法。
- **立场校准**：通过 5 个简短问题建立仅保存在当前浏览器中的阅读起点。
- **茧房距离控制**：在“熟悉—平衡—探索”之间调整 Open Feed 的目标观点距离。
- **三种算法配方**：支持平衡视角、多元来源和证据优先三种阅读目标。
- **可解释排序**：每条内容都可以查看相关性、观点距离、来源新颖度、证据强度等排序依据。
- **Feed 营养标签**：展示观点构成、来源多样性、单一来源集中度和证据内容比例。
- **配方 Fork 与发布**：修改六项权重，预览与父配方的差异，并在 Monad 测试网上发布新版本。
- **中英双语**：界面、说明、校准问题和内容摘要均支持中文与 English。
- **静态快照优先**：演示不依赖实时抓取，弱网环境下仍能稳定运行。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | HTML5、CSS3、原生 JavaScript ES Modules |
| 排序 | 浏览器端线性加权评分与归一化 |
| Web3 | EIP-1193 钱包接口、标准 ABI calldata |
| 智能合约 | Solidity `0.8.30` |
| 区块链 | Monad Testnet，Chain ID `10143` |
| 合约验证 | Sourcify |
| 托管 | Vercel 静态部署 |
| 测试 | Node.js Test Runner |

项目没有运行时 npm 依赖，也不需要后端数据库。

## 安装与运行

### 环境要求

- Git
- Python 3（用于启动本地静态服务器）
- Node.js 20 或更高版本（仅在执行检查与测试时需要）

### 1. 克隆仓库

```bash
git clone https://github.com/everyeveryV/unbubble.git
cd unbubble
```

### 2. 启动本地网站

无需执行 `npm install`：

```bash
npm start
```

浏览器打开：

```text
http://127.0.0.1:4174/
```

英文界面直达地址：

```text
http://127.0.0.1:4174/?lang=en
```

### 3. 运行检查与测试

```bash
npm run check
npm test
```

## 推荐体验路径

1. 回答 5 个立场问题，或跳过并使用中立值。
2. 对比 Engagement Feed 与 Open Feed 的前几条内容。
3. 调节“茧房距离”，观察 Open Feed 与营养标签如何实时变化。
4. 点击“为什么排这里？”查看一条内容的排序依据。
5. 切换三种算法配方，比较不同阅读目标产生的排序变化。
6. 复制配方、修改权重，并连接钱包发布到 Monad 测试网。

## 算法模型

Open Feed 使用可解释的线性评分模型：

```text
Score = Relevance
      + Bridge Match
      + Source Novelty
      + Evidence Strength
      + Exploration
      - Repetition Penalty
```

所有计算都在浏览器内完成。每项权重都会显示在界面中，用户可以修改并立即看到排序结果，不需要依赖黑盒模型的实时推理。

## Monad 合约

- 网络：Monad Testnet
- Chain ID：`10143`
- 合约地址：`0x700e5c58099e2c2808c577eb161c3631c928ae8f`
- 编译器：Solidity `0.8.30+commit.73712a01`
- Sourcify 状态：创建字节码与运行时字节码精确匹配

`OpenFeedRegistry` 保存：

- 配方创建者
- 父配方与 Fork 关系
- 六项可还原权重
- 内容清单哈希
- 配方发布时间

文章正文、校准答案、阅读历史和钱包私钥不会写入合约。

## 数据与隐私边界

- `data/feed.mjs` 包含 20 条人工策展的公开来源快照及 MVP 标注。
- 每条内容均保留原始来源链接。
- 标签是可质疑、可替换的算法输入，不被描述为客观真理。
- 用户校准结果仅保存在当前浏览器中。
- 仓库不包含私钥、助记词、API Key、Vercel 凭据或 `.env` 文件。

## 项目结构

```text
unbubble/
├─ contracts/
│  └─ OpenFeedRegistry.sol   # 配方注册与 Fork 关系合约
├─ data/
│  └─ feed.mjs               # 内容快照、标签与基础配方
├─ src/
│  ├─ algorithms.mjs         # 校准、评分、排序与指标计算
│  ├─ app.mjs                # 页面状态与交互
│  ├─ config.mjs             # Monad 测试网公开配置
│  ├─ deploy.mjs             # 钱包连接与链上发布
│  ├─ evm.mjs                # Keccak 与 ABI 编码
│  └─ i18n.mjs               # 中英文文案
├─ test/
│  └─ algorithms.test.mjs    # 核心逻辑测试
├─ deploy.html               # 合约部署辅助页面
├─ index.html                # 产品页面
├─ styles.css                # 响应式新野兽派视觉系统
└─ package.json
```

## 合约源码验证

- [Sourcify 公开源码](https://repo.sourcify.dev/10143/0x700e5c58099E2C2808c577eb161C3631C928AE8f)
- [Sourcify 验证报告](https://verify.sourcify.dev/jobs/7bd0b998-9f17-4972-8777-3484272dfec6)
