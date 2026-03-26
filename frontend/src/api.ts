import type {
  GraphResponse,
  NodePositions,
  NodePositionsResponse,
  SaveNodePositionsRequest,
  SkillPrerequisitePayload,
} from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export async function fetchSkillsGraph(signal?: AbortSignal): Promise<GraphResponse> {
  const res = await fetch(`${API_BASE_URL}/api/skills-graph`, { signal })
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as GraphResponse
}

export async function fetchNodePositions(signal?: AbortSignal): Promise<NodePositions> {
  const res = await fetch(`${API_BASE_URL}/api/node-positions`, { signal })
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
  const payload = (await res.json()) as NodePositionsResponse
  return payload.positions ?? {}
}

export async function saveNodePositions(payload: SaveNodePositionsRequest): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/node-positions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
}

export async function createSkillPrerequisite(payload: SkillPrerequisitePayload): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/skill-prerequisites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
}

export async function deleteSkillPrerequisite(payload: SkillPrerequisitePayload): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/skill-prerequisites`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
}

