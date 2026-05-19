import { ModuleAnalysis } from '../analyzer/types';

export interface FeatureGraphFile {
  path: string;      // relative to module (e.g. "components/grid.tsx")
  usage: string;     // AI-described purpose
  methods?: string[]; // function/method names in this file for this feature
}

export interface FeatureGraphData {
  nodes: Array<{ id: string; label: string; files: FeatureGraphFile[] }>;
  edges: Array<{ from: string; to: string; label: string; source: string }>;
}

// Extension → Webview
export type ExtensionToWebviewMessage =
  | { type: 'loading'; modulePath: string }
  | { type: 'progress'; step: string }
  | { type: 'error'; message: string; modulePath?: string }
  | { type: 'data'; analysis: ModuleAnalysis };

// Webview → Extension
export type WebviewToExtensionMessage =
  | { type: 'openFile'; filePath: string }
  | { type: 'openFileAtSymbol'; filePath: string; symbol: string }
  | { type: 'openFolder'; folderPath: string }
  | { type: 'openUrl'; url: string }
  | { type: 'drillDown'; folderPath: string };
