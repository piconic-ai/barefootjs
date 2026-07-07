/**
 * @barefootjs/adapter-tests — Public API
 *
 * Provides a conformance test suite for TemplateAdapter implementations.
 */

export { runJSXConformanceTests, normalizeHTML, stripConditionalMarkersForCrossAdapter } from './jsx-runner'
export { createFixture, normalizeExpectedHtml } from './types'
export type { JSXFixture, ExpectedDiagnostic } from './types'
export { indentHTML } from './indent-html'
export type { RunJSXConformanceOptions, RenderOptions } from './jsx-runner'
export { runConformanceSuite } from './conformance'
export type {
  ConformanceAdapter,
  ConformanceCase,
  RunSuiteArgs,
} from './conformance'
export {
  templatePrimitiveCases,
  TemplatePrimitiveCaseId,
  runTemplatePrimitiveCase,
  FALLBACK_SENTINEL,
} from './cases/template-primitives'
export type { TemplatePrimitiveInput } from './cases/template-primitives'
export { runAdapterConformanceTests } from './run-adapter-conformance'
export type { RunAdapterConformanceOptions } from './run-adapter-conformance'
export { assertDevReloadContract } from './dev-reload.contract'
export type { DevReloadFacts } from './dev-reload.contract'
export { assertImportMapInjectionContract } from './import-map-injection.contract'
export type { ImportMapInjectionFacts } from './import-map-injection.contract'
export { assertScaffoldContract, ensureCreateCli } from './scaffold.contract'
export type { ScaffoldFacts } from './scaffold.contract'
export { assertRenderContract, decodeHtmlEntities } from './render.contract'
export type { AssertRenderContractOptions } from './render.contract'
