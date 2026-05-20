# Codeveal — VSCode 插件需求规格文档

> 帮助团队新人快速理解项目模块结构的 VSCode 插件。

---

## 一句话定义

右键一个功能模块文件夹 → 侧边栏展示思维导图 → 四个维度直观呈现模块职责、对外暴露、外部依赖、数据流。

---

## 目标用户

- 刚入职的新人，需要快速上手陌生模块
- 老手接手新模块，需要快速建立全局认知
- 周会/分享时，直观演示某个模块的架构

---

## 项目背景（目标仓库结构）

```
fms-network/                        # monorepo 根目录
├── apps/
│   ├── network-react/              # React + TypeScript
│   │   └── src/
│   │       ├── api/
│   │       ├── components/
│   │       ├── hooks/
│   │       ├── moduleEntries/
│   │       ├── pages/              # 每个子目录 = 一个功能模块（右键分析粒度）
│   │       ├── store/
│   │       ├── types/
│   │       └── utils/
│   └── network-vue/                # Vue 2
│       └── src/
│           ├── api/
│           ├── components/
│           ├── filters/
│           ├── hooks/
│           ├── mixins/
│           ├── moduleEntries/
│           ├── plugins/
│           ├── router/
│           ├── shared/
│           ├── store/
│           ├── views/              # 每个子目录 = 一个功能模块（右键分析粒度）
│           └── utils/
├── pnpm-workspace.yaml             # pnpm monorepo
├── nx.json                         # Nx 管理
└── lerna.json
```

**特殊依赖关系**：两个 app 通过 Webpack Module Federation 互相引用，Vue 项目会引用 React 项目的组件。静态分析时需读取 webpack 配置中的 `exposes` / `remotes` 字段，将 MF 引用正确识别为"内部跨 app 依赖"而非第三方库。

**目前没有抽离 packages/ 共享包**，两个 app 各自维护独立的 api 层。

---

## MVP 功能范围

### 触发方式
右键任意文件夹 → 菜单出现 **"Codeveal: 分析此模块"** → 侧边栏打开思维导图

### 分析粒度
以页面/视图子目录为推荐粒度，例如：
- `src/pages/dashboard/`
- `src/views/user-manage/`

### 展示四个维度

| 维度 | 数据来源 | 说明 |
|------|---------|------|
| 模块职责 | AI 生成 | 一句话总结模块是干嘛的，拆出核心行为 |
| 对外暴露 | 静态分析 + AI 注释 | 哪些组件/hook/工具函数是对外导出的，每个附一句 AI 描述 |
| 外部依赖 | 静态分析 | 依赖了哪些其他模块或第三方库（含 MF 跨 app 引用） |
| 数据流 | AI 生成 | 数据从哪来、经过什么处理、最终到哪去 |

### 交互设计
- 每个节点可点击，触发下一层分析（下钻）
- 节点点击可跳转对应源文件
- 按需触发，不干扰日常开发

---

## 技术方案

### 整体流程

```
右键触发
   ↓
静态扫描文件夹
（ts-morph 解析 TS/TSX，vue-template-compiler 解析 .vue）
   ↓
生成结构骨架摘要
（文件列表 + export + import 关系，不传完整代码）
   ↓
一次 AI CLI 调用，同时生成职责 + 数据流
（返回结构化 JSON）
   ↓
合并静态分析结果 + AI 输出
   ↓
侧边栏 Webview 渲染思维导图
```

### 静态分析

- React/TS：使用 `ts-morph` 解析 `.ts` / `.tsx`
- Vue2：使用 `vue-template-compiler` + `@vue/component-compiler-utils` 解析 `.vue`
- 提取内容：文件列表、export、import、函数/组件签名
- **不传完整代码给 AI**，只传骨架摘要（预计 800~1500 token/模块）

### AI Skill 接口（订阅制 CLI）

所有人使用订阅制 AI，通过子进程调用 CLI，不涉及 API Key：

```typescript
interface AISkill {
  isAvailable(): Promise<boolean>  // 检测 CLI 是否安装
  run(prompt: string): Promise<string>
}

// 两个实现
class ClaudeCodeSkill implements AISkill {
  // exec: claude --print "..."
}

class CodexSkill implements AISkill {
  // exec: codex "..."
}
```

插件启动时自动检测哪个 CLI 可用；用户也可在 VSCode 设置里手动指定。

### AI Prompt 设计（一次调用）

```
根据以下模块结构骨架，返回 JSON：
{
  "responsibility": "一句话描述模块职责",
  "dataFlow": [
    { "from": "数据来源", "through": "处理环节", "to": "最终去向" }
  ]
}

[骨架摘要内容]
```

### Token 消耗估算

| 部分 | 估算 |
|------|------|
| 骨架摘要（input） | 800 ~ 1500 tokens |
| Prompt 指令 | ~200 tokens |
| AI 输出 | ~400 tokens |
| **合计** | **~1500 ~ 2100 tokens/次** |

订阅制不按 token 计费，成本可忽略。

### 思维导图渲染

- Webview 内使用 `markmap` 或 `D3.js` 渲染
- 节点支持点击跳转源文件（`vscode.open`）
- 节点点击可触发下一层分析（下钻到子目录或文件级）

### 参考项目

**Graphify**（https://github.com/safishamsi/graphify）：
- 定位不同（CLI skill，面向 AI 对话查询；Codeveal 是 VSCode 可视化工具）
- 可复用其静态分析思路（tree-sitter AST 提取、调用图）
- 可考虑直接读取 Graphify 生成的 `graphify-out/graph.json` 作为数据源，减少重复开发

---

## 开发任务拆解（MVP）

| 优先级 | 任务 | 预估 |
|--------|------|------|
| P0 | VSCode 插件脚手架（`yo code` 初始化） | 半天 |
| P0 | 右键菜单注册 + 命令触发 | 半天 |
| P0 | 静态分析器 — React/TS 版（ts-morph） | 1 天 |
| P0 | AI CLI 调用层（Claude Code 先，Codex 后补） | 半天 |
| P0 | 侧边栏 Webview + 思维导图渲染（四维度） | 1 天 |
| P1 | 静态分析器 — Vue2 版 | 1 天 |
| P1 | Codex CLI 适配 | 半天 |
| P1 | 节点点击跳转源码 | 半天 |
| P1 | MF 跨 app 依赖识别（读 webpack 配置） | 半天 |

**预计 MVP 完成时间：3~4 天**

---

## 留到 v2 的功能

- 变更热度（git log 分析，标记高频修改文件）
- 入口追踪（反向依赖，"改这里会影响哪些地方"）
- 测试覆盖展示
- 仓库级全局分析（整个 monorepo 的模块依赖图）

---

## 插件名

**Codeveal** — 一瞥即懂
