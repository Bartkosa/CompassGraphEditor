import type {
  GraphDataset,
  GraphResponse,
  NodePositions,
  NodePositionsResponse,
  SaveNodePositionsRequest,
  SkillPrerequisitePayload,
} from './types'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')

/** Dataset in the URL path so caches/proxies cannot serve the wrong graph for `?dataset=` alone. */
function withDatasetPath(prefix: string, dataset: GraphDataset): string {
  const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
  return `${base}/${encodeURIComponent(dataset)}`
}

function apiUrl(path: string): string {
  if (!API_BASE_URL) {
    return path.startsWith('/') ? path : `/${path}`
  }
  const p = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${p}`
}

const NO_STORE: RequestCache = 'no-store'

export async function fetchSkillsGraph(
  dataset: GraphDataset = 'cke',
  signal?: AbortSignal,
): Promise<GraphResponse> {
  const res = await fetch(apiUrl(withDatasetPath('/api/skills-graph', dataset)), {
    signal,
    cache: NO_STORE,
  })
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as GraphResponse
}

export async function fetchNodePositions(
  dataset: GraphDataset = 'cke',
  signal?: AbortSignal,
): Promise<NodePositions> {
  const res = await fetch(apiUrl(withDatasetPath('/api/node-positions', dataset)), {
    signal,
    cache: NO_STORE,
  })
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
  const payload = (await res.json()) as NodePositionsResponse
  return payload.positions ?? {}
}

export async function saveNodePositions(
  dataset: GraphDataset,
  payload: SaveNodePositionsRequest,
): Promise<void> {
  const res = await fetch(apiUrl(withDatasetPath('/api/node-positions', dataset)), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: NO_STORE,
  })
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
}

export async function createSkillPrerequisite(
  dataset: GraphDataset,
  payload: SkillPrerequisitePayload,
): Promise<void> {
  const res = await fetch(apiUrl(withDatasetPath('/api/skill-prerequisites', dataset)), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: NO_STORE,
  })
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
}

export async function deleteSkillPrerequisite(
  dataset: GraphDataset,
  payload: SkillPrerequisitePayload,
): Promise<void> {
  const params = new URLSearchParams({
    source_skill_id: String(payload.source_skill_id),
    target_skill_id: String(payload.target_skill_id),
  })
  const res = await fetch(apiUrl(`${withDatasetPath('/api/skill-prerequisites', dataset)}?${params.toString()}`), {
    method: 'DELETE',
    cache: NO_STORE,
  })
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
}

