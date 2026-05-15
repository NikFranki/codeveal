import { ModuleAnalysis } from '../analyzer/types';

// Extension → Webview
export type ExtensionToWebviewMessage =
  | { type: 'loading'; modulePath: string }
  | { type: 'progress'; step: string }
  | { type: 'error'; message: string; modulePath?: string }
  | { type: 'data'; analysis: ModuleAnalysis };

// Webview → Extension
export type WebviewToExtensionMessage =
  | { type: 'openFile'; filePath: string }
  | { type: 'openFolder'; folderPath: string }
  | { type: 'openUrl'; url: string }
  | { type: 'drillDown'; folderPath: string };
