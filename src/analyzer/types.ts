export type FileType = 'ts' | 'tsx' | 'vue' | 'js';

export interface ImportRef {
  source: string;
  kind: 'local' | 'thirdParty' | 'mf';
  names: string[];
}

export interface FileInfo {
  relativePath: string;
  type: FileType;
  exports: string[];
  imports: ImportRef[];
}

export type ExportKind = 'component' | 'hook' | 'util' | 'type' | 'unknown';

export interface ExportInfo {
  name: string;
  kind: ExportKind;
  filePath: string;
}

export interface MFDep {
  remote: string;
  exposedPath: string;
}

export interface ModuleSkeleton {
  modulePath: string;
  files: FileInfo[];
  publicExports: ExportInfo[];
  externalDeps: string[];
  mfDeps: MFDep[];
}

export interface AIOutput {
  responsibility: string;
  dataFlow: Array<{ from: string; through: string; to: string }>;
}

export interface ModuleAnalysis extends ModuleSkeleton {
  ai: AIOutput;
  exportDescriptions: Record<string, string>;
}
