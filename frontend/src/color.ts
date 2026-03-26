const PALETTE = [
  '#2563EB', // blue
  '#DC2626', // red
  '#16A34A', // green
  '#7C3AED', // violet
  '#EA580C', // orange
  '#0891B2', // cyan
  '#DB2777', // pink
  '#CA8A04', // amber
  '#4B5563', // gray
  '#0F766E', // teal
  '#9333EA', // purple
  '#65A30D', // lime
]

function hashString(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function topicColor(topicCkeCode: string): string {
  const idx = hashString(topicCkeCode) % PALETTE.length
  return PALETTE[idx]
}

