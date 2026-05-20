# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Codeveal** is a VS Code extension. Right-click a folder or `.ts/.tsx/.vue/.js` file in the Explorer → "Codeveal: Analyze This Module" → a panel opens beside the editor with a **Mindmap** tab (markmap) and a **Feature Graph** tab (D3 force-DAG). The command ID is `codeveal.analyzeModule`.

Target codebase: React + Vue 2 TypeScript monorepos, with Webpack Module Federation support.

## Commands

```bash
pnpm install          # install deps (requires pnpm)
pnpm run compile      # tsc -p tsconfig.json → out/
pnpm run watch        # incremental tsc watch
pnpm run lint         # eslint src --ext ts
# F5 in VS Code → Extension Development Host for debugging
```

There are no automated tests. Verification is manual via F5.

## Architecture: data pipeline

```
Right-click → codeveal.analyzeModule
  │
  ├─ analyzeModule()          src/analyzer/index.ts
  │    ├─ collectFiles()      walks dir, skips node_modules/dist/build/out/__tests__
  │    ├─ analyzeReactFile()  src/analyzer/react-analyzer.ts  (ts-morph, .ts/.tsx/.js)
  │    ├─ analyzeVueFile()    src/analyzer/vue-analyzer.ts    (vue-template-compiler)
  │    └─ findMFConfig()      src/analyzer/mf-analyzer.ts     (reads webpack.config.js)
  │    → ModuleSkeleton
  │
  ├─ detectSkill()            src/ai/detector.ts
  │    tries ClaudeSkill then CodexSkill (or forced by codeveal.aiProvider config)
  │
  ├─ buildPrompt(skeleton)    src/ai/prompt-builder.ts
  │    compact skeleton: exports, imports, props/state/methods — max 30 files, ~1500 tokens
  │    NO full source code in the prompt
  │
  ├─ skill.run(prompt)        src/ai/claude-skill.ts | codex-skill.ts
  │    subprocess: `claude --model <model> --print <prompt>` (or codex equivalent)
  │    timeout controlled by codeveal.aiTimeout (default 360 s)
  │
  ├─ parseAIOutput(raw)       src/ai/prompt-builder.ts
  │    tolerates fenced blocks; validates into AIRawOutput
  │
  ├─ inferFeatureRelations()  src/analyzer/feature-relations.ts
  │    merges static import graph with AI-supplied featureRelations
  │    → ModuleAnalysis
  │
  └─ provider.postMessage({ type: 'data', analysis })
       CodevealPanelManager   src/webview/provider.ts
         buildMarkmapMarkdown()  src/webview/ui/mindmap.ts
         buildFeatureGraph()     src/webview/ui/feature-graph.ts
       → postMessage adds { markdown, graph } then sends to Webview
```

## Key type contracts

All cross-layer types live in two files; never bypass them:

- **`src/analyzer/types.ts`** — `FileInfo`, `ModuleSkeleton`, `ModuleAnalysis`, `AIOutput`, `DataFlowFeature`, `FeatureRelation`
- **`src/webview/messages.ts`** — `ExtensionToWebviewMessage`, `WebviewToExtensionMessage`, `FeatureGraphData`
- **`src/ai/types.ts`** — `AISkill` interface, `AIRawOutput`

## Webview architecture

`CodevealPanelManager` is a singleton (`getInstance`). It manages one `WebviewPanel` (`ViewColumn.Beside`). The entire HTML/CSS/JS is a single inline string in `provider.ts:_getHtml()`. D3 v7 and markmap-autoloader are loaded from `cdn.jsdelivr.net` (whitelisted in CSP). There is no bundler step for the webview — all webview JS is written directly in the template literal.

Webview state is persisted via `vscode.getState()` / `vscode.setState()` so the panel survives hide/reveal cycles.

## Configuration (`src/config.ts`)

| Setting | Default | Notes |
|---|---|---|
| `codeveal.aiProvider` | `"auto"` | `auto` → claude then codex fallback |
| `codeveal.claudeModel` | `"claude-haiku-4-5-20251001"` | Haiku for speed; override in settings |
| `codeveal.companyScopes` | `["@scfe", "@spx", ...]` | Prefixes classified as company-internal deps |
| `codeveal.aiTimeout` | `360` s | Min 30 s; subprocess is killed on timeout |

## Key constraints

- AI subprocess must never block the VS Code main thread — use `spawn` + `async/await` throughout.
- Only the skeleton summary (export/import lists, file names) goes to the AI. Full source code must not be included in prompts.
- `ExportKind` guessing in `analyzer/index.ts:guessExportKind` relies on naming conventions: `use*` → hook, `*Type/*Interface/*Props` → type, uppercase → component, lowercase → util.
- MF remotes are detected by reading `webpack.config.js` statically (no Node.js eval). Imports matching a known remote name get `kind: 'mf'` instead of `'thirdParty'`.
- The webview CSP allows scripts only from `cdn.jsdelivr.net` and the extension's own nonce — do not add other script sources.

## Reference files

- Spec: `codeveal-spec.md`
- Plan / task tracker: `plan.md` — mark tasks `[x]` when complete
