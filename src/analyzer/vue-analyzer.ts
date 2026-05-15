import * as fs from 'fs';
import * as path from 'path';
import { Project, SyntaxKind } from 'ts-morph';
import { parseComponent } from 'vue-template-compiler';
import { FileInfo, ImportRef } from './types';
import { classifyImport } from './react-analyzer';

// Shared in-memory project for Vue script blocks — avoids recreating per file
const vueProject = new Project({ useInMemoryFileSystem: true });
const VIRTUAL_FILE = '/vue-script.ts';

export function analyzeVueFile(
  filePath: string,
  modulePath: string,
  mfRemoteNames: string[]
): FileInfo {
  const relativePath = path.relative(modulePath, filePath);
  const source = fs.readFileSync(filePath, 'utf-8');
  const sfc = parseComponent(source);
  const scriptContent = sfc.script?.content ?? '';

  const exports: string[] = [];
  const imports: ImportRef[] = [];

  if (scriptContent.trim()) {
    let sf = vueProject.getSourceFile(VIRTUAL_FILE);
    if (sf) {
      sf.replaceWithText(scriptContent);
    } else {
      sf = vueProject.createSourceFile(VIRTUAL_FILE, scriptContent);
    }

    for (const decl of sf.getImportDeclarations()) {
      const src = decl.getModuleSpecifierValue();
      const names: string[] = [...decl.getNamedImports().map((n) => n.getName())];
      const def = decl.getDefaultImport();
      if (def) names.push(def.getText());
      imports.push({ source: src, kind: classifyImport(src, mfRemoteNames), names });
    }

    // Named exports (Composition API helpers, utils)
    for (const [name] of sf.getExportedDeclarations()) {
      if (name !== 'default') {
        exports.push(name);
      }
    }

    // Options API default export — extract component name if present
    const defaultExport = sf
      .getDescendantsOfKind(SyntaxKind.ExportAssignment)
      .find((ea) => !ea.isExportEquals());

    if (defaultExport) {
      const objLiteral = defaultExport.getFirstDescendantByKind(
        SyntaxKind.ObjectLiteralExpression
      );
      const nameProp = objLiteral
        ?.getProperty('name')
        ?.asKind(SyntaxKind.PropertyAssignment);
      const componentName = nameProp
        ?.getInitializer()
        ?.getText()
        ?.replace(/^['"]|['"]$/g, '');
      exports.push(componentName ?? 'default');
    }
  }

  return { relativePath, type: 'vue', exports, imports };
}
