# Glimpse — 开发计划

> 基于 glimpse-spec.md，从零搭建 VSCode 插件。
> 状态标记：`[ ]` 待做 · `[x]` 已完成 · `[~]` 进行中

---

## 架构设计

### 目录结构

```
glimpse/
├── .claude/
│   └── CLAUDE.md                     # Claude Code 工作指引
├── src/
│   ├── extension.ts                  # 插件入口，注册命令 & 侧边栏
│   ├── commands/
│   │   └── analyzeModule.ts          # 右键命令处理器
│   ├── analyzer/
│   │   ├── types.ts                  # 静态分析结果类型
│   │   ├── index.ts                  # 分析器 orchestrator（判断 TS/Vue）
│   │   ├── react-analyzer.ts         # ts-morph 解析 .ts/.tsx
│   │   ├── vue-analyzer.ts           # vue-template-compiler 解析 .vue
│   │   └── mf-analyzer.ts            # 读取 webpack MF config（exposes/remotes）
│   ├── ai/
│   │   ├── types.ts                  # AISkill 接口 + 输出类型
│   │   ├── claude-skill.ts           # claude --print 子进程封装
│   │   ├── codex-skill.ts            # codex 子进程封装
│   │   ├── detector.ts               # 自动检测可用 CLI
│   │   └── prompt-builder.ts         # Skeleton → prompt 字符串
│   ├── webview/
│   │   ├── provider.ts               # WebviewViewProvider 注册侧边栏
│   │   ├── messages.ts               # Extension ↔ Webview 消息类型
│   │   └── ui/
│   │       ├── index.html            # Webview HTML 模板
│   │       └── mindmap.ts            # markmap 渲染逻辑
│   └── config.ts                     # 读取 VSCode 用户配置
├── package.json                      # 插件 manifest
├── tsconfig.json
├── .vscodeignore
└── glimpse-spec.md
```

### 核心类型（src/analyzer/types.ts）

```typescript
interface FileInfo {
  relativePath: string
  type: 'ts' | 'tsx' | 'vue' | 'js'
  exports: string[]           // 导出名列表
  imports: ImportRef[]        // import 来源
}

interface ImportRef {
  source: string              // 原始 import path
  kind: 'local' | 'thirdParty' | 'mf'  // MF = Module Federation
  names: string[]
}

interface ModuleSkeleton {
  modulePath: string          // 绝对路径
  files: FileInfo[]
  publicExports: ExportInfo[] // 模块对外暴露的 export（index.ts 导出）
  externalDeps: string[]      // 第三方依赖名
  mfDeps: MFDep[]             // MF 跨 app 引用
}

interface MFDep {
  remote: string              // remote app 名
  exposedPath: string         // exposed 的组件路径
}

interface AIOutput {
  responsibility: string
  dataFlow: { from: string; through: string; to: string }[]
}

interface ModuleAnalysis extends ModuleSkeleton {
  ai: AIOutput
  exportDescriptions: Record<string, string>  // AI 生成的每个 export 描述
}
```

### 数据流（整体）

```
右键文件夹
   ↓
analyzeModule.ts
   ↓
analyzer/index.ts → 扫描文件 → react-analyzer / vue-analyzer
                              └─ mf-analyzer（读 webpack config）
   ↓
ModuleSkeleton（只含骨架，不含完整源码）
   ↓
ai/detector.ts → 找可用 CLI
   ↓
ai/prompt-builder.ts → 生成 prompt
   ↓
claude/codex 子进程 → 返回 AIOutput JSON
   ↓
合并 → ModuleAnalysis
   ↓
webview/provider.ts → postMessage
   ↓
ui/mindmap.ts → markmap 渲染四维度节点
```

---

## 开发任务

### Phase 0 — 项目脚手架

- [x] **0.1** 初始化 VSCode 插件项目（`yo code` 或手动 package.json）
- [x] **0.2** 配置 TypeScript（tsconfig.json，target ES2020，strict）
- [x] **0.3** 配置 .vscodeignore、.gitignore
- [x] **0.4** 安装基础依赖：`ts-morph`、`vue-template-compiler`、`@vue/component-compiler-utils`
- [x] **0.5** git init + 初始提交

### Phase 1 — 插件入口 & 命令注册

- [x] **1.1** `src/extension.ts`：activate/deactivate，注册 command + webview provider
- [x] **1.2** `package.json` manifest：contributes.commands（右键菜单）、contributes.views（侧边栏）、activationEvents
- [x] **1.3** `src/commands/analyzeModule.ts`：接收 `vscode.Uri`，触发分析流程，更新 webview 状态

### Phase 2 — 静态分析器

- [x] **2.1** `src/analyzer/types.ts`：定义全部类型（FileInfo、ModuleSkeleton 等）
- [x] **2.2** `src/analyzer/react-analyzer.ts`：ts-morph 解析 .ts/.tsx，提取 exports + imports
- [x] **2.3** `src/analyzer/vue-analyzer.ts`：解析 .vue SFC，提取 script 部分的 exports + imports
- [x] **2.4** `src/analyzer/mf-analyzer.ts`：查找并解析 webpack.config.js 的 `exposes`/`remotes`，标记 MF 依赖
- [x] **2.5** `src/analyzer/index.ts`：orchestrator，遍历文件夹，路由到对应 analyzer，汇总 ModuleSkeleton

### Phase 3 — AI 调用层

- [x] **3.1** `src/ai/types.ts`：AISkill 接口、AIOutput 类型
- [x] **3.2** `src/ai/claude-skill.ts`：`claude --print "<prompt>"` 子进程调用，解析 JSON
- [x] **3.3** `src/ai/detector.ts`：`which claude` / `which codex`，返回可用 skill 实例
- [x] **3.4** `src/ai/prompt-builder.ts`：ModuleSkeleton → prompt 字符串（控制在 1500 token 内）
- [x] **3.5** `src/ai/codex-skill.ts`：codex 适配（P1，claude 通了再做）

### Phase 4 — Webview & 思维导图

- [x] **4.1** `src/webview/messages.ts`：Extension → Webview 的消息类型（loading / data / error）
- [x] **4.2** `src/webview/provider.ts`：注册侧边栏 WebviewViewProvider，处理 resolveWebviewView
- [x] **4.3** `src/webview/ui/index.html`：HTML 模板，引入 markmap CDN（或本地 bundle）
- [x] **4.4** `src/webview/ui/mindmap.ts`：接收 ModuleAnalysis，生成 markmap markdown，渲染四维度
- [x] **4.5** 节点点击跳转源文件（postMessage 回 extension → `vscode.open`）

### Phase 5 — 配置 & 体验

- [x] **5.1** `src/config.ts`：读取 `glimpse.aiProvider` 设置（auto / claude / codex）
- [x] **5.2** `package.json` contributes.configuration：暴露 aiProvider 配置项
- [x] **5.3** 加载中状态、错误提示（AI 不可用时的友好 fallback）

### Phase 6 — Vue2 & MF 补全（P1）

- [ ] **6.1** vue-analyzer 边缘情况处理（Options API 导出、mixins）
- [ ] **6.2** MF 跨 app 依赖在思维导图中单独分组展示
- [ ] **6.3** 节点下钻（点击子文件夹触发下一层分析）

### Phase 7 — 功能关系图（Feature Graph）

> 目标：在现有思维导图旁新增"功能关系图"tab，用有向图展示文件间依赖关系。

#### 7.1 已完成

- [x] 类型扩展：`FeatureRelation`、`AIRawOutputRelation`、`FeatureGraphData`
- [x] 静态推断：`inferFeatureRelations`（跨功能域 import 追踪 + AI 语义合并）
- [x] AI 提示词：扩展 `featureRelations[]` schema + 解析
- [x] Webview：D3 force-directed 图、双向弧线、箭头、自定义 HTML tooltip
- [x] Tab 切换：思维导图 / 功能关系图
- [x] 节点 tooltip：显示文件列表 + 用途 + 方法名
- [x] 节点点击：跳转到对应文件或方法（`openFileAtSymbol`）
- [x] 图例：左上角说明箭头语义（A→B 表示 A 导入了 B）

#### 7.2 待实现（文件节点重构）

- [x] **7.2.1** 节点模型切换：从"功能域节点"改为"文件节点"
  - 节点 = 一个文件，边 = 真实 import 关系（静态分析，100% 准确）
  - AI 角色变为"为每个节点写注释"而非"划分节点"
  - 过滤规则：隐藏 `*.d.ts`、纯 type 文件；默认隐藏 `constants/utils/helpers`（可切换）
- [x] **7.2.2** 布局升级：混合 force-DAG
  - 拓扑排序分配每个文件的深度（depth），有环时 BFS 近似处理
  - `d3.forceY` 按 depth 分层（纵向有层次），`d3.forceX` 自由浮动（横向自然散开）
  - 有循环依赖的节点停在妥协位置，不报错
- [x] **7.2.3** Tooltip 升级为交互式 popover
  - `pointer-events: auto`，支持鼠标移入 tooltip
  - 离开节点后延迟 150ms 隐藏，移入 tooltip 取消隐藏
  - 内部分区折叠：**状态**、**交互流转**（behaviors）默认折叠，hover 展开
  - 数据来源：透传 `state`、`behaviors`、`jsx` 到 `FeatureGraphFile`
- [x] **7.2.4** 大模块处理（文件数 > 15）
  - 按目录分组，超出阈值时目录折叠为单个节点
  - 点击折叠节点展开子图（钻取）

#### 7.3 待讨论

- [x] 文件节点颜色：同功能域文件用同色（featureGroup → groupColor，已在 7.2.1 实现）
- [x] 边的 label：默认不显示，hover 时在 edge tooltip 里展示文件名（已在 7.2.3 实现）

---

## 关键决策记录

| 决策 | 选择 | 原因 |
|------|------|------|
| 思维导图库 | markmap（优先）| 直接用 Markdown 语法生成，开发成本低；D3 备选 |
| AI 骨架传输 | 只传 export/import 列表，不传完整代码 | 控制 token，减少隐私风险 |
| AI 调用方式 | 子进程调用订阅制 CLI | 不暴露 API Key，用户用自己的订阅 |
| MF 依赖识别 | 静态读 webpack config | 运行时识别太重，静态够用 |
| Vue 解析 | vue-template-compiler + script 提取 | 官方工具链，稳定 |
| 关系图节点粒度 | 文件节点（非功能域节点）| 功能域节点导致多节点指向同一文件、点击跳转不准；文件节点语义明确，一节点对应一文件 |
| 关系图布局 | 混合 force-DAG | 纯 force-directed 节点多时混乱无方向感；纯 DAG 遇到循环依赖会崩；混合方案用拓扑排序分配 y 层级 + D3 force 处理 x 方向，有环时自然妥协不报错 |
| 关系图 tooltip | 交互式 popover（非穿透 tooltip）| 需要支持 hover 内部区块展开详情；改为 pointer-events:auto + 离开延迟隐藏 |

---

## 里程碑

| 里程碑 | 包含 Phase | 目标 |
|--------|-----------|------|
| M1 — 骨架跑通 | 0 + 1 | 右键能触发命令，侧边栏能打开（空白） |
| M2 — 静态分析 | 2 | 能产出 ModuleSkeleton JSON |
| M3 — AI 接通 | 3 | Claude CLI 能返回职责 + 数据流 |
| M4 — MVP 完整 | 4 + 5 | 四维度思维导图可交互 |
| M5 — P1 功能 | 6 | Vue2 完整支持、MF 可视化 |