import type { GraphResponse } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export async function fetchSkillsGraph(signal?: AbortSignal): Promise<GraphResponse> {
  const res = await fetch(`${API_BASE_URL}/api/skills-graph`, { signal })
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as GraphResponse
}

