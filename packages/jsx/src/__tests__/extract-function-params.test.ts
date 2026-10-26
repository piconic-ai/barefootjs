import { expect, test } from 'bun:test'
import { extractFunctionParams } from '../index.ts'

const cases = [
  ['(a, b) => a + b', 'a, b'],
  ['async value => value', 'value'],
  ['function named(a: string, b = 1) { return a }', 'a, b'],
  ['async function named(a: string) {}', 'a'],
  ['(handler: (value: string) => void, label = "a,b") => handler(label)', 'handler, label'],
  ['(value = build(1, 2), next = () => 1) => value', 'value, next'],
  ['(value: Record<string, number>, ...rest: string[]) => value', 'value, ...rest'],
  ['<T,>(value: T): T => value', 'value'],
  ['<T>(value: T): T => value', 'value'],
  ['(value: string) => <span>{value}</span>', 'value'],
  ['(value = <span />, next) => value', 'value, next'],
  ['function f(value = <span />, next) {}', 'value, next'],
  ['async (value = <span title="a,b" />, next = 1) => value', 'value, next'],
  ['function* f(value = <span>{1}</span>, ...rest) {}', 'value, ...rest'],
  ['(value = <number>1, next) => value', 'value, next'],
  ['(value = , next) => value', ''],
  ['(値: number, $other?: string) => 値', '値, $other'],
  ['({ value: renamed }, [first, second]) => renamed', '{ value: renamed }, [first, second]'],
  ['/* input */ ((value: string) => value)', 'value'],
  ['() => 1', ''],
  ['"(fake) => fake"', ''],
  ['call((nested) => nested)', ''],
]

for (const [source, expected] of cases) {
  test(`extractFunctionParams: ${source}`, () => {
    expect(extractFunctionParams(source)).toBe(expected)
  })
}

test('long non-function input has no parameters', () => {
  expect(extractFunctionParams(`async ${' '.repeat(20_000)} notAFunction`)).toBe('')
})
