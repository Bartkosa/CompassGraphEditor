import './App.css'
import { useState } from 'react'
import type { Topic } from './types'
import { SkillsGraph } from './SkillsGraph'
import { TopicLegend } from './TopicLegend'

function App() {
  const [topics, setTopics] = useState<Topic[]>([])
  const [summary, setSummary] = useState<{ topics: number; skills: number } | null>(null)
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null)

  return (
    <div className="appShell">
      <header className="topBar">
        <div className="topBarTitle">Compass Skills Graph</div>
        <div className="topBarHint">
          Click a skill for details. Drag to rearrange; pan and zoom the canvas.
          {summary && (
            <span className="topBarSummary">
              Topics: {summary.topics} · Skills: {summary.skills}
            </span>
          )}
        </div>
      </header>
      <div className="content">
        <main className="main">
          <SkillsGraph
            onTopicsLoaded={setTopics}
            onSummaryLoaded={setSummary}
            highlightTopicId={selectedTopicId}
          />
        </main>
        <aside className="side">
          <TopicLegend
            topics={topics}
            selectedTopicId={selectedTopicId}
            onTopicSelect={(topicId) =>
              setSelectedTopicId((prev) => (prev === topicId ? null : topicId))
            }
          />
        </aside>
      </div>
    </div>
  )
}

export default App
