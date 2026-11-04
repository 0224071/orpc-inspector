import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect, it } from 'vitest'

it('ships typed devtools setup without the consumer importing the host', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orpc-inspector-types-'))
  try {
    const entry = join(dir, 'consumer.ts')
    const plugin = fileURLToPath(new URL('../../dist/vite.js', import.meta.url)).replaceAll('\\', '/')
    writeFileSync(entry, `import { orpcInspector } from ${JSON.stringify(plugin)}\nconst inspector = orpcInspector()\n`)
    // A separate program avoids the host's ambient Vite augmentation in the repo's test sources.
    const program = ts.createProgram([entry], {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
      types: [],
      strict: true,
      skipLibCheck: true,
      noEmit: true,
    })
    expect(program.getSemanticDiagnostics(program.getSourceFile(entry)!)).toEqual([])
    const checker = program.getTypeChecker()
    const declaration = program.getSourceFile(entry)!.statements[1] as ts.VariableStatement
    const inspector = declaration.declarationList.declarations[0]!
    const inspectorType = checker.getTypeAtLocation(inspector.name)
    const devtools = checker.getTypeOfSymbolAtLocation(inspectorType.getProperty('devtools')!, inspector)
    const setup = devtools.getProperty('setup')
    expect(setup).toBeDefined()
    const signatures = checker.getTypeOfSymbolAtLocation(setup!, inspector).getCallSignatures()
    expect(signatures).toHaveLength(1)
    const context = checker.getTypeOfSymbolAtLocation(signatures[0]!.parameters[0]!, inspector)
    expect(context.getProperty('install')).toBeDefined()
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
