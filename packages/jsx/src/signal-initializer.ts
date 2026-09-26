/**
 * Client-JS initializers for signals that `createSignal` does not produce.
 *
 * Two factory families are collected as signals: env signals
 * (`createSearchParams()`, #2057) and async reactive factories
 * (`createQuery(fn, options)`, #3165). Every backend that re-emits a signal
 * declaration into client JS asks this module for the initializer instead of
 * hard-coding `createSignal`, so a new factory kind is one entry here rather
 * than a special case per emit site.
 */

import type { SignalInfo } from './types.ts'
import { ENV_SIGNAL_CLIENT_FACTORY } from './adapters/env-signal.ts'

/**
 * The initializer expression that produces this signal's tuple in client JS
 * when it isn't `createSignal(<initialValue>)`, or `null` for an ordinary
 * signal. An async factory re-emits its own call with the authored arguments;
 * an env signal calls its factory with none.
 */
export function signalFactoryInitializer(signal: SignalInfo): string | null {
  if (signal.factory) return `${signal.factory.callee}(${signal.factory.argsText})`
  if (signal.envReader) {
    const factory = signal.envFactory ?? ENV_SIGNAL_CLIENT_FACTORY[signal.envReader]
    return factory ? `${factory}()` : null
  }
  return null
}

/**
 * The second binding of the signal's tuple as written in the source: the
 * setter for `createSignal` and env signals, the action for an async factory.
 */
export function signalSecondBinding(signal: SignalInfo): string | null {
  return signal.setter ?? signal.factory?.action ?? null
}
