// Filesystem helpers shared across build pipeline steps.

/**
 * Write content to path only when it differs from what is already on disk.
 * Returns true when a write occurred. Avoids re-firing file watchers when
 * the output is byte-identical to the previous build.
 */
export async function writeIfChanged(
  path: string,
  content: string | ArrayBufferView | ArrayBuffer | Blob,
): Promise<boolean> {
  const existing = Bun.file(path)
  if (await existing.exists()) {
    if (typeof content === 'string') {
      const prev = await existing.text()
      if (prev === content) return false
    } else {
      const prev = new Uint8Array(await existing.arrayBuffer())
      const next = await toUint8Array(content)
      if (equalBytes(prev, next)) return false
    }
  }
  await Bun.write(path, content as Parameters<typeof Bun.write>[1])
  return true
}

async function toUint8Array(
  content: ArrayBufferView | ArrayBuffer | Blob,
): Promise<Uint8Array> {
  if (content instanceof Blob) return new Uint8Array(await content.arrayBuffer())
  if (content instanceof ArrayBuffer) return new Uint8Array(content)
  return new Uint8Array(content.buffer, content.byteOffset, content.byteLength)
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
