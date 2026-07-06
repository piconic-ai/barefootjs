/**
 * Statistics helpers for the benchmark runner.
 * All functions take an array of numeric samples (already-measured
 * milliseconds, bytes, etc.) and are pure / side-effect free.
 */

export function mean(nums: number[]): number {
  if (nums.length === 0) return Number.NaN
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function stddev(nums: number[]): number {
  if (nums.length === 0) return Number.NaN
  const m = mean(nums)
  const variance = nums.reduce((a, b) => a + (b - m) ** 2, 0) / nums.length
  return Math.sqrt(variance)
}

/** Linear-interpolation quantile (matches numpy's default "linear" method). */
export function quantile(nums: number[], q: number): number {
  if (nums.length === 0) return Number.NaN
  const sorted = [...nums].sort((a, b) => a - b)
  if (sorted.length === 1) return sorted[0]
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const lo = sorted[base]
  const hi = sorted[base + 1]
  return hi === undefined ? lo : lo + rest * (hi - lo)
}

export function median(nums: number[]): number {
  return quantile(nums, 0.5)
}

export function min(nums: number[]): number {
  return nums.length ? Math.min(...nums) : Number.NaN
}

export function max(nums: number[]): number {
  return nums.length ? Math.max(...nums) : Number.NaN
}

export interface Stats {
  median: number
  mean: number
  stddev: number
  min: number
  max: number
  q1: number
  q3: number
  n: number
}

export function computeStats(nums: number[]): Stats {
  return {
    median: median(nums),
    mean: mean(nums),
    stddev: stddev(nums),
    min: min(nums),
    max: max(nums),
    q1: quantile(nums, 0.25),
    q3: quantile(nums, 0.75),
    n: nums.length,
  }
}
