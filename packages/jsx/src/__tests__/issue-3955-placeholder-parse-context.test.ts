/**
 * #3955 — the CSR placeholder a child component's position holds until the
 * client mounts it must stay where it is written when the template is parsed.
 * A `<div>` did not under a `<p>` (the parser closes the paragraph), in a
 * `<tbody>` / `<tr>` (foster-parented before the table) or in an `<svg>` (it
 * ends the SVG). Both emission sites — a child deferred to init in the
 * component template, and a child in a composite loop row's template — print
 * the one spelling `componentPlaceholderMarkup` returns, a `<template>`.
 *
 * The mounted result is pinned in a real browser by the
 * `deferred-child-phrasing-parent`, `deferred-child-table-svg-parent` and
 * `composite-row-child-restricted-parent` fixtures (fixture-hydrate and the
 * `three-point` oracle).
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { componentPlaceholderMarkup } from '../ir-to-client-js/utils'

const adapter = new TestAdapter()

function compile(source: string): string {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  expect(result.errors.map(e => `${e.code} ${e.message}`)).toEqual([])
  return result.files.filter(f => f.path.endsWith('.js')).map(f => f.content).join('\n')
}

describe('#3955 — the child placeholder parses in place under any parent', () => {
  test('the placeholder is a <template> carrying the placeholder id', () => {
    expect(componentPlaceholderMarkup('s3')).toBe('<template data-bf-ph="s3"></template>')
  })

  test('a child deferred to init under a <p>, a <tbody>, a <tr> and an <svg>', () => {
    const js = compile(`'use client'
import { createSignal } from '@barefootjs/client'
function Tag(props: { v: string }) { return <b>{props.v}</b> }
function Row(props: { v: string }) { return <tr><td>{props.v}</td></tr> }
function Cell(props: { v: string }) { return <td>{props.v}</td> }
function Dot(props: { v: string }) { return <circle data-v={props.v} /> }
export function Host() {
  const [n] = createSignal('a')
  // A block body keeps \`v\` init-only: the client template splices an
  // expression-bodied zero-param helper's call as its body (#3975).
  const read = () => {
    return n()
  }
  const v = read()
  return (
    <div>
      <p><Tag v={v} /></p>
      <table><tbody><Row v={v} /><tr><Cell v={v} /></tr></tbody></table>
      <svg><Dot v={v} /></svg>
    </div>
  )
}`)
    expect(js).not.toContain('<div data-bf-ph')
    expect(js).toContain(`<p>${componentPlaceholderMarkup('s0')}</p>`)
    expect(js).toContain(`<tbody>${componentPlaceholderMarkup('s1')}<tr>${componentPlaceholderMarkup('s2')}</tr></tbody>`)
    expect(js).toContain(`<svg>${componentPlaceholderMarkup('s3')}</svg>`)
  })

  test('a child in a composite loop row under a <p> and in a <tr> row', () => {
    const js = compile(`'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number; label: string }
function Tag(props: { v: string }) { return <b>{props.v}</b> }
function Cell(props: { v: string }) { return <td>{props.v}</td> }
export function Rows(props: { items: Item[] }) {
  const [rows] = createSignal<Item[]>(props.items)
  return (
    <div>
      <ul>{rows().map(r => <li key={r.id}><p><Tag v={r.label} /></p></li>)}</ul>
      <table><tbody>{rows().map(r => <tr key={r.id}><Cell v={r.label} /></tr>)}</tbody></table>
    </div>
  )
}`)
    expect(js).not.toContain('<div data-bf-ph')
    expect(js).toMatch(/<li data-key="[^"]*"><p><template data-bf-ph="s\d+"><\/template><\/p><\/li>/)
    expect(js).toMatch(/<tr data-key="[^"]*"><template data-bf-ph="s\d+"><\/template><\/tr>/)
  })
})
