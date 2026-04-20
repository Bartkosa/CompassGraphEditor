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

/** Legacy APIs that only support `?dataset=` (no `/resource/{dataset}` path). */
function withDatasetQuery(basePath: string, dataset: GraphDataset): string {
  const b = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
  const sep = b.includes('?') ? '&' : '?'
  return `${b}${sep}dataset=${encodeURIComponent(dataset)}`
}

/**
 * Prefer dataset in the path; if the server returns 404 (unknown route or static host), retry with `?dataset=`.
 */
async function fetchWithDatasetRouting(
  basePath: string,
  dataset: GraphDataset,
  init: RequestInit,
): Promise<Response> {
  const primary = apiUrl(withDatasetPath(basePath, dataset))
  let res = await fetch(primary, { ...init, cache: NO_STORE })
  if (res.status === 404) {
    res = await fetch(apiUrl(withDatasetQuery(basePath, dataset)), { ...init, cache: NO_STORE })
  }
  return res
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
  const res = await fetchWithDatasetRouting('/api/skills-graph', dataset, { signal })
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as GraphResponse
}

export async function fetchNodePositions(
  dataset: GraphDataset = 'cke',
  signal?: AbortSignal,
): Promise<NodePositions> {
  const res = await fetchWithDatasetRouting('/api/node-positions', dataset, { signal })
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
  const body = JSON.stringify(payload)
  const res = await fetchWithDatasetRouting('/api/node-positions', dataset, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
}

export async function createSkillPrerequisite(
  dataset: GraphDataset,
  payload: SkillPrerequisitePayload,
): Promise<void> {
  const body = JSON.stringify(payload)
  const res = await fetchWithDatasetRouting('/api/skill-prerequisites', dataset, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
}

export async function deleteSkillPrerequisite(
  dataset: GraphDataset,
  payload: SkillPrerequisitePayload,
): Promise<void> {
  const pathIds = `${withDatasetPath('/api/skill-prerequisites', dataset)}/${payload.source_skill_id}/${payload.target_skill_id}`
  const init: RequestInit = { method: 'DELETE', cache: NO_STORE }
  let res = await fetch(apiUrl(pathIds), init)
  if (res.status === 404) {
    const q = new URLSearchParams({
      dataset,
      source_skill_id: String(payload.source_skill_id),
      target_skill_id: String(payload.target_skill_id),
    })
    res = await fetch(apiUrl(`/api/skill-prerequisites?${q}`), init)
  }
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
}

