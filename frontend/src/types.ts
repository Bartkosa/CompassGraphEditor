export type Topic = {
  /** DB `topics.id` — unique per topic row (distinct from duplicate cke_code). */
  id: number
  topic_cke_code: string
  topic_name: string
  grade_from: number
  grade_to: number
}

export type SkillNode = {
  id: string
  label: string
  /** `skills.short_name` — shown on the graph node. */
  short_name: string
  /** `skills.name` — full description. */
  name: string
  /** DB `topics.id` for the skill’s topic row. */
  topic_id: number
  topic_cke_code: string
  /** `topics.name` */
  topic_name: string
  grade_from: number
  grade_to: number
  // Original numeric code of the skill (from `skills.cke_code`)
  skill_cke_code: string
}

export type GraphResponse = {
  topics: Topic[]
  nodes: SkillNode[]
  edges: Array<{
    id?: string
    source: string
    target: string
  }>
}

