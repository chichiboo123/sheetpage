/**
 * In-memory stand-in for Netlify Blobs, used only by `npm run check:functions`.
 * The real store is provided by the platform at runtime and cannot be reached
 * from a plain Node process.
 */
const data = new Map<string, unknown>()

export function getStore(_options: unknown) {
  return {
    setJSON: async (key: string, value: unknown) => {
      data.set(key, JSON.parse(JSON.stringify(value)))
    },
    get: async (key: string, _options?: unknown) => data.get(key) ?? null,
  }
}

/** Test-only escape hatch for asserting and seeding what was stored. */
export const __store = data
