// Extension → Webview
export type ExtensionToWebviewMessage =
  | { type: 'loading'; modulePath: string }
  | { type: 'error'; message: string }
  | { type: 'data'; analysis: unknown } // typed properly in Phase 4 after ModuleAnalysis is defined

// Webview → Extension
export type WebviewToExtensionMessage =
  | { type: 'openFile'; filePath: string }
  | { type: 'drillDown'; folderPath: string }
