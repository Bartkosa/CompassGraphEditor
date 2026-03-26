import { useCallback, useEffect, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { fetchSkillsGraph } from './api'
import type { GraphResponse } from './types'
import { topicColor } from './color'
import { layoutSkillsByTopic } from './layout'
import { skillFlowNodeTypes } from './skillFlowNodeTypes'
import type { SkillFlowNodeData } from './SkillFlowNode'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: GraphResponse }

export type SelectedSkillDetail = {
  id: string
  short_name: string
  name: string
  topic_name: string
  topic_cke_code: string
  grade_from: number
  grade_to: number
  skill_cke_code: string
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex)
  if (!m) return `rgba(0,0,0,${alpha})`
  const raw = m[1]
  const r = parseInt(raw.slice(0, 2), 16)
  const g = parseInt(raw.slice(2, 4), 16)
  const b = parseInt(raw.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function useWindowSize() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

export function SkillsGraph(props: {
  onTopicsLoaded?: (topics: GraphResponse['topics']) => void
  onSummaryLoaded?: (summary: { topics: number; skills: number }) => void
  highlightTopicId?: number | null
}) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [selectedSkill, setSelectedSkill] = useState<SelectedSkillDetail | null>(null)
  const { onTopicsLoaded, onSummaryLoaded, highlightTopicId } = props
  const { width, height } = useWindowSize()

  useEffect(() => {
    const ctrl = new AbortController()
    fetchSkillsGraph(ctrl.signal)
      .then((data) => {
        setState({ kind: 'ready', data })
        onTopicsLoaded?.(data.topics)
        onSummaryLoaded?.({ topics: data.topics.length, skills: data.nodes.length })
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load graph'
        setState({ kind: 'error', message: msg })
      })
    return () => ctrl.abort()
  }, [onTopicsLoaded, onSummaryLoaded])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    if (state.kind !== 'ready') {
      setNodes([])
      setEdges([])
      return
    }

    const selectedIds =
      highlightTopicId == null
        ? null
        : new Set(state.data.nodes.filter((n) => n.topic_id === highlightTopicId).map((n) => n.id))
    const topicByNodeId =
      highlightTopicId == null
        ? null
        : new Map(state.data.nodes.map((n) => [n.id, n.topic_cke_code] as const))

    const layout = layoutSkillsByTopic({
      topics: state.data.topics,
      nodes: state.data.nodes,
      viewportWidth: Math.max(400, width - 320),
      viewportHeight: height,
    })

    setNodes((prev) => {
      const posById = new Map(prev.map((n) => [n.id, n.position]))
      return layout.positioned.map((n) => ({
        id: n.id,
        type: 'skill' as const,
        position: posById.get(n.id) ?? { x: n.x, y: n.y },
        data: {
          label: n.label,
          short_name: n.short_name,
          name: n.name,
          topic_name: n.topic_name,
          topic_cke_code: n.topic_cke_code,
          grade_from: n.grade_from,
          grade_to: n.grade_to,
          skill_cke_code: n.skill_cke_code,
        },
        draggable: true,
        style: (() => {
          const base = {
            padding: '5px 7px',
            borderRadius: 8,
            maxWidth: 140,
            minWidth: 0,
            boxSizing: 'border-box' as const,
            color: '#111827',
            transition:
              'background 120ms ease, border-color 120ms ease, opacity 120ms ease, box-shadow 120ms ease',
          }

          const isSelected = highlightTopicId != null && n.topic_id === highlightTopicId
          const topic = topicColor(n.topic_cke_code)
          if (highlightTopicId == null) {
            return {
              ...base,
              border: `1px solid ${topic}`,
              background: hexToRgba(topic, 0.14),
            }
          }

          if (isSelected) {
            return {
              ...base,
              border: `2px solid ${topic}`,
              background: hexToRgba(topic, 0.32),
              boxShadow: `0 10px 22px ${hexToRgba(topic, 0.18)}`,
              opacity: 1,
            }
          }

          return {
            ...base,
            border: `1px solid ${hexToRgba(topic, 0.35)}`,
            background: hexToRgba(topic, 0.06),
            boxShadow: 'none',
            opacity: 0.28,
          }
        })(),
      }))
    })

    const edgesRf: Edge[] = (state.data.edges ?? []).map((e, idx) => {
      const sourceSelected = selectedIds?.has(e.source) ?? false
      const targetSelected = selectedIds?.has(e.target) ?? false
      const bothSelected = sourceSelected && targetSelected
      const edgeTopic = topicByNodeId?.get(e.source) ?? '#64748b'

      return {
        id: e.id ?? `e-${idx}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        style:
          highlightTopicId == null
            ? undefined
            : {
                stroke: bothSelected ? edgeTopic : hexToRgba(edgeTopic, 0.35),
                strokeWidth: bothSelected ? 1.6 : 0.8,
                opacity: bothSelected ? 0.85 : 0.15,
                transition: 'opacity 120ms ease, stroke-width 120ms ease, stroke 120ms ease',
              },
        selectable: false,
        draggable: false,
      }
    })
    setEdges(edgesRf)
  }, [state, width, height, highlightTopicId, setNodes, setEdges])

  const onMoveStart = useCallback(() => {
    document.body.style.cursor = 'grabbing'
  }, [])
  const onMoveEnd = useCallback(() => {
    document.body.style.cursor = ''
  }, [])

  const onNodeClick: NodeMouseHandler = useCallback((_evt, node) => {
    const d = node.data as SkillFlowNodeData
    if (d == null || typeof d.short_name !== 'string') return
    setSelectedSkill({
      id: node.id,
      short_name: d.short_name,
      name: d.name,
      topic_name: d.topic_name,
      topic_cke_code: d.topic_cke_code,
      grade_from: d.grade_from,
      grade_to: d.grade_to,
      skill_cke_code: d.skill_cke_code,
    })
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedSkill(null)
  }, [])

  if (state.kind === 'error') {
    return (
      <div className="panelMessage">
        <div className="panelTitle">Failed to load</div>
        <div className="panelBody">{state.message}</div>
      </div>
    )
  }

  return (
    <div className="graphWrap">
      {state.kind === 'loading' && (
        <div className="panelMessage">
          <div className="panelTitle">Loading…</div>
          <div className="panelBody">Fetching skills from Postgres.</div>
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={skillFlowNodeTypes}
        nodesDraggable
        fitView
        fitViewOptions={{ padding: 0.2 }}
        onNodeDragStart={onMoveStart}
        onNodeDragStop={onMoveEnd}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
      >
        <Background />
        <Controls />
      </ReactFlow>
      {selectedSkill && (
        <div className="skillDetailPanel" role="dialog" aria-label="Skill details">
          <div className="skillDetailPanelHeader">
            <span className="skillDetailPanelTitle">Skill</span>
            <button
              type="button"
              className="skillDetailClose"
              aria-label="Close"
              onClick={() => setSelectedSkill(null)}
            >
              ×
            </button>
          </div>
          <dl className="skillDetailDl">
            <dt>Short name</dt>
            <dd>{selectedSkill.short_name || '—'}</dd>
            <dt>Name</dt>
            <dd className="skillDetailName">{selectedSkill.name || '—'}</dd>
            <dt>Skill code (cke_code)</dt>
            <dd>{selectedSkill.skill_cke_code || '—'}</dd>
            <dt>Topic</dt>
            <dd>
              <span className="skillDetailTopicName">{selectedSkill.topic_name || '—'}</span>
              <span className="skillDetailTopicMeta">
                {' '}
                (code {selectedSkill.topic_cke_code}, classes {selectedSkill.grade_from}–
                {selectedSkill.grade_to})
              </span>
            </dd>
          </dl>
        </div>
      )}
    </div>
  )
}

