import type { Topic, SkillNode } from './types'

export type PositionedSkill = SkillNode & {
  x: number
  y: number
}

export type LayoutTuning = {
  // Affects overall left padding from the viewport edge.
  paddingX?: number
  // Topic columns horizontal pitch (px). Larger => more distance between topics.
  topicColumnWidthPx?: number
  // Vertical pitch between consecutive skills inside the same topic column (px).
  nodeVerticalStepPx?: number
  // Extra top offset inside each band before the first skill in every topic (px).
  topicTopPaddingPx?: number
}

type Band = 'lower' | 'upper'

/** CKE uses grade ranges; MA topics map a single DB `grade` to both `grade_from` and `grade_to` on the API. */
function topicBand(t: Topic): Band {
  if (t.grade_from === 4 && t.grade_to === 6) return 'lower'
  if (t.grade_from === 7 && t.grade_to === 8) return 'upper'
  return t.grade_from <= 6 ? 'lower' : 'upper'
}

function stableSort<T>(arr: T[], key: (t: T) => string): T[] {
  return [...arr].sort((a, b) => key(a).localeCompare(key(b)))
}

function topicNumericKey(topicCode: string): string {
  const n = Number(topicCode)
  // If codes are integers stored as strings, numeric ordering avoids `10` coming before `2`.
  // If parsing fails, fall back to lexicographic ordering.
  return Number.isFinite(n) ? n.toString().padStart(20, '0') : topicCode
}

export function layoutSkillsByTopic(args: {
  topics: Topic[]
  nodes: SkillNode[]
  viewportWidth: number
  viewportHeight: number
  tuning?: LayoutTuning
}): { positioned: PositionedSkill[]; topicCenters: Record<string, { x: number; y: number; band: Band }> } {
  const { topics, nodes, viewportWidth, viewportHeight, tuning } = args

  const {
    paddingX = 10,
    topicColumnWidthPx = 170,
    nodeVerticalStepPx = 45,
    topicTopPaddingPx = 10,
  } = tuning ?? {}

  const topicSortKey = (t: Topic) =>
    `${topicNumericKey(t.topic_cke_code)}:${String(t.id).padStart(12, '0')}`
  const upperTopics = stableSort(topics.filter((t) => topicBand(t) === 'upper'), topicSortKey)
  const lowerTopics = stableSort(topics.filter((t) => topicBand(t) === 'lower'), topicSortKey)

  // Two rectangles: upper (for grade 7–8) and lower (for grade 4–6).
  // Keeping them sufficiently large makes clusters clearly separated visually.
  const upperYMin = Math.max(60, viewportHeight * 0.08)
  const upperYMax = Math.min(viewportHeight * 0.62, upperYMin + 420)
  const lowerYMin = Math.max(upperYMax + 60, viewportHeight * 0.56)
  const lowerYMax = Math.min(viewportHeight * 0.97, lowerYMin + 520)

  const nodesByTopic = new Map<string, SkillNode[]>()
  for (const n of nodes) {
    const k = String(n.topic_id)
    const list = nodesByTopic.get(k) ?? []
    list.push(n)
    nodesByTopic.set(k, list)
  }

  const positioned: PositionedSkill[] = []
  const topicCenters: Record<string, { x: number; y: number; band: Band }> = {}

  // Layout by band so we preserve the upper/lower separation.
  const layoutBand = (bandTopics: Topic[], band: Band, bandYMin: number) => {
    for (let topicIndex = 0; topicIndex < bandTopics.length; topicIndex++) {
      const t = bandTopics[topicIndex]
      const x = paddingX + topicIndex * topicColumnWidthPx
      const yStart = bandYMin + topicTopPaddingPx

      const topicIdKey = String(t.id)
      topicCenters[topicIdKey] = { x: x + topicColumnWidthPx / 2, y: yStart, band }

      const skills = nodesByTopic.get(topicIdKey) ?? []
      const sortedSkills = stableSort(skills, (s) => skillNumericKey(s.skill_cke_code))

      for (let nodeIndex = 0; nodeIndex < sortedSkills.length; nodeIndex++) {
        const n = sortedSkills[nodeIndex]
        positioned.push({
          ...n,
          x,
          y: yStart + nodeIndex * nodeVerticalStepPx,
        })
      }
    }
  }

  layoutBand(upperTopics, 'upper', upperYMin)
  layoutBand(lowerTopics, 'lower', lowerYMin)

  // Preserve unused bounds to keep behavior stable if we later decide to auto-scale step.
  void upperYMax
  void lowerYMax
  void viewportWidth

  return { positioned, topicCenters }
}

function skillNumericKey(skillCode: string): string {
  const n = Number(skillCode)
  // Always return a string key so stableSort stays deterministic.
  // If numeric parse fails, fall back to raw code lexicographic ordering.
  return Number.isFinite(n) ? n.toString().padStart(12, '0') : skillCode
}

