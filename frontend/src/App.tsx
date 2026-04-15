import './App.css'
import { useState } from 'react'
import type { GraphDataset, Topic } from './types'
import { SkillsGraph } from './SkillsGraph'
import { TopicLegend } from './TopicLegend'

const DATASET_STORAGE_KEY = 'compass-skills-graph-dataset'

function readStoredDataset(): GraphDataset {
  try {
    const raw = localStorage.getItem(DATASET_STORAGE_KEY)
    if (raw === 'cke' || raw === 'ma') return raw
  } catch {
    /* private mode / blocked storage */
  }
  return 'cke'
}

function persistDataset(ds: GraphDataset) {
  try {
    localStorage.setItem(DATASET_STORAGE_KEY, ds)
  } catch {
    /* ignore */
  }
}

function App() {
  const [dataset, setDataset] = useState<GraphDataset>(readStoredDataset)
  const [topics, setTopics] = useState<Topic[]>([])
  const [summary, setSummary] = useState<{ topics: number; skills: number } | null>(null)
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null)
  const [graphToolbarHost, setGraphToolbarHost] = useState<HTMLDivElement | null>(null)

  return (
    <div className="appShell">
      <header className="topBar">
        <div className="topBarTopRow">
          <div className="topBarTitleRow">
            <div className="topBarTitle">Compass Skills Graph</div>
            <label className="topBarDataset">
              <span className="topBarDatasetLabel">Dataset</span>
              <select
                className="topBarDatasetSelect"
                value={dataset}
                onChange={(e) => {
                  const next = e.target.value as GraphDataset
                  persistDataset(next)
                  setDataset(next)
                  setSelectedTopicId(null)
                }}
                aria-label="Graph dataset"
              >
                <option value="cke">CKE (topics / skills)</option>
                <option value="ma">MA (ma_topics / ma_skills)</option>
              </select>
            </label>
          </div>
          <div className="topBarToolbarHost" ref={setGraphToolbarHost} aria-label="Graph tools" />
        </div>
        <div className="topBarHint">
          Click a skill for details. Drag to rearrange; hold Shift to mark multiple nodes and move them together.
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
            key={dataset}
            dataset={dataset}
            toolbarPortalEl={graphToolbarHost}
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
