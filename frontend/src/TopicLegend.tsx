import type { Topic } from './types'
import { topicColor } from './color'

function gradeBandLabel(t: Topic): string {
  if (t.grade_from === 7 && t.grade_to === 8) return 'Grades 7–8'
  if (t.grade_from === 4 && t.grade_to === 6) return 'Grades 4–6'
  return `Grades ${t.grade_from}–${t.grade_to}`
}

function topicNumericKey(topicCode: string): string {
  const n = Number(topicCode)
  // Avoid lexicographic anomalies like "10" before "2".
  return Number.isFinite(n) ? n.toString().padStart(20, '0') : topicCode
}

export function TopicLegend(props: {
  topics: Topic[]
  selectedTopicId: number | null
  onTopicSelect: (topicId: number) => void
}) {
  const topics = [...props.topics].sort((a, b) => {
    const aBand = a.grade_from === 7 && a.grade_to === 8 ? 0 : 1
    const bBand = b.grade_from === 7 && b.grade_to === 8 ? 0 : 1
    if (aBand !== bBand) return aBand - bBand
    return topicNumericKey(a.topic_cke_code).localeCompare(topicNumericKey(b.topic_cke_code))
  })

  const groups = new Map<string, Topic[]>()
  for (const t of topics) {
    const key = gradeBandLabel(t)
    const list = groups.get(key) ?? []
    list.push(t)
    groups.set(key, list)
  }

  return (
    <div className="legend">
      <div className="legendTitle">Topics</div>
      {[...groups.entries()].map(([label, group]) => (
        <div key={label} className="legendGroup">
          <div className="legendGroupTitle">{label}</div>
          <ul className="legendList">
            {group.map((t) => (
              <li
                key={t.id}
                className={props.selectedTopicId === t.id ? 'legendItem legendItemSelected' : 'legendItem'}
                title={`${t.topic_name} (id ${t.id})`}
                role="button"
                tabIndex={0}
                onClick={() => props.onTopicSelect(t.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    props.onTopicSelect(t.id)
                  }
                }}
              >
                <span className="swatch" style={{ background: topicColor(t.topic_cke_code) }} />
                <span className="legendName">{t.topic_name}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

