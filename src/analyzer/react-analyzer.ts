import * as path from 'path';
import { SourceFile } from 'ts-morph';
import { FileInfo, FileType, ImportRef } from './types';

export function analyzeReactFile(
  sourceFile: SourceFile,
  modulePath: string,
  mfRemoteNames: string[]
): FileInfo {
  const filePath = sourceFile.getFilePath();
  const relativePath = path.relative(modulePath, filePath);
  const ext = path.extname(filePath).slice(1) as FileType;

  const exports: string[] = [];
  for (const [name] of sourceFile.getExportedDeclarations()) {
    exports.push(name);
  }

  const imports: ImportRef[] = sourceFile.getImportDeclarations().map((decl) => {
    const source = decl.getModuleSpecifierValue();
    const names: string[] = [
      ...decl.getNamedImports().map((n) => n.getName()),
    ];
    const defaultImp = decl.getDefaultImport();
    if (defaultImp) names.push(defaultImp.getText());

    return { source, kind: classifyImport(source, mfRemoteNames), names };
  });

  return { relativePath, type: ext, exports, imports };
}

export function classifyImport(
  source: string,
  mfRemoteNames: string[]
): 'local' | 'thirdParty' | 'mf' {
  if (source.startsWith('.')) return 'local';
  for (const remote of mfRemoteNames) {
    if (source === remote || source.startsWith(`${remote}/`)) return 'mf';
  }
  return 'thirdParty';
}
