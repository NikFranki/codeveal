import { ModuleAnalysis } from '../analyzer/types';

export interface FeatureGraphNode {
  id: string;            // relative file path (unique key)
  label: string;         // short display name (basename without ext)
  path: string;          // relative file path
  depth: number;         // 0 = entry, higher = deeper dependency
  dir: string;           // first path segment ("components"), or "" for root files
  usage: string;
  state: string[];
  behaviors: string[];
  methods: string[];
  jsx?: string;
  featureGroup?: string; // AI feature domain (used for color grouping)
}

export interface FeatureGraphData {
  nodes: FeatureGraphNode[];
  edges: Array<{ from: string; to: string }>;
  foldedDirs: string[];  // dirs initially collapsed when file count > threshold
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
