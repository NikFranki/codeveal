# Glimpse — Claude Code 工作指引

## 项目简介

Glimpse 是一个 VSCode 插件：右键功能模块文件夹 → 侧边栏展示思维导图，四维度呈现模块职责、对外暴露、外部依赖、数据流。

目标仓库是 `fms-network` monorepo（React + Vue2，含 Webpack Module Federation）。

## 当前进度

详见根目录 `plan.md`。每完成一个任务在 plan.md 中标记 `[x]`。

## 目录结构

```text
src/
├── extension.ts          # 插件入口
├── commands/             # 命令处理器
├── analyzer/             # 静态分析（ts-morph + vue-template-compiler）
├── ai/                   # AI CLI 调用层
├── webview/              # 侧边栏 Webview + 思维导图渲染
└── config.ts             # VSCode 配置读取
```

## 技术栈

- TypeScript（strict mode）
- VSCode Extension API
- ts-morph（解析 TS/TSX）
- vue-template-compiler（解析 .vue）
- markmap（思维导图渲染，Webview 内）
- 子进程调用 claude CLI / codex CLI（不使用 API Key）

## 编码规范

- 所有文件严格 TypeScript，不用 `any`
- 模块间通过类型定义的接口通信，不跨层直接引用
- AI 调用只传骨架摘要，不传完整源码（控制 token + 隐私）
- Webview ↔ Extension 通信只用 `messages.ts` 中定义的类型

## 关键约束

- AI 调用是子进程，不阻塞 VSCode 主线程（用 async/await + spawn）
- 插件激活事件：`onCommand:glimpse.analyzeModule`，按需激活
- MF 依赖：静态读 webpack.config.js 的 `exposes`/`remotes` 字段

## 开发命令

```bash
# 安装依赖（确保有 pnpm）
pnpm install

# 编译
pnpm run compile

# 在 VSCode 中按 F5 启动 Extension Development Host 调试
```

## 参考

- 需求文档：`glimpse-spec.md`
- 开发计划：`plan.md`