import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import {
  createSkillPrerequisite,
  deleteSkillPrerequisite,
  fetchNodePositions,
  fetchSkillsGraph,
  saveNodePositions,
} from './api'
import type { GraphDataset, GraphResponse, SkillNode } from './types'
import { topicColor } from './color'
import { layoutSkillsByTopic } from './layout'
import { skillFlowNodeTypes } from './skillFlowNodeTypes'
import type { SkillFlowNodeData } from './SkillFlowNode'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: GraphResponse }
type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string }
type EdgeMutationState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string }

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

function getHandlesByNodeY(sourceY?: number, targetY?: number): { sourceHandle?: string; targetHandle?: string } {
  if (sourceY == null || targetY == null) return {}
  if (targetY < sourceY) {
    return { sourceHandle: 'source-top', targetHandle: 'target-bottom' }
  }
  return { sourceHandle: 'source-bottom', targetHandle: 'target-top' }
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

function skillNodeChromeStyle(
  topicCkeCode: string,
  topicId: number,
  highlightTopicId: number | null | undefined,
  searchHit: boolean
): { style: CSSProperties; zIndex?: number } {
  const base = {
    padding: '8px 10px',
    borderRadius: 16,
    width: 110,
    minWidth: 110,
    boxSizing: 'border-box' as const,
    color: '#111827',
    transition:
      'background 120ms ease, border-color 120ms ease, opacity 120ms ease, box-shadow 120ms ease',
  }
  const isSelected = highlightTopicId != null && topicId === highlightTopicId
  const topic = topicColor(topicCkeCode)
  let topicStyle: CSSProperties
  if (highlightTopicId == null) {
    topicStyle = {
      ...base,
      border: `1px solid ${topic}`,
      background: hexToRgba(topic, 0.14),
    }
  } else if (isSelected) {
    topicStyle = {
      ...base,
      border: `2px solid ${topic}`,
      background: hexToRgba(topic, 0.32),
      boxShadow: `0 10px 22px ${hexToRgba(topic, 0.18)}`,
      opacity: 1,
    }
  } else {
    topicStyle = {
      ...base,
      border: `1px solid ${hexToRgba(topic, 0.35)}`,
      background: hexToRgba(topic, 0.06),
      boxShadow: 'none',
      opacity: 0.28,
    }
  }
  if (searchHit) {
    return {
      style: {
        ...topicStyle,
        border: '3px solid #2563eb',
        boxShadow:
          '0 0 0 3px rgba(37, 99, 235, 0.35), 0 12px 28px rgba(37, 99, 235, 0.22)',
        opacity: 1,
      },
      zIndex: 10,
    }
  }
  return { style: topicStyle, zIndex: undefined }
}

function normalizeSearchQuery(raw: string): string {
  return raw
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function normSkillField(s: string): string {
  return normalizeSearchQuery(s)
}

/** Exact match on name / short_name / skill_cke_code, then substring on name, then on short_name / code. */
function findSkillNodeIdsByQuery(nodes: SkillNode[], rawQuery: string): string[] {
  const q = normalizeSearchQuery(rawQuery)
  if (!q) return []

  const exact: string[] = []
  for (const n of nodes) {
    const fields = [n.name, n.short_name, n.skill_cke_code].map((f) => normSkillField(f ?? ''))
    if (fields.some((f) => f === q)) {
      exact.push(n.id)
    }
  }
  if (exact.length > 0) return exact

  const byName: string[] = []
  for (const n of nodes) {
    const name = normSkillField(n.name ?? '')
    if (name && name.includes(q)) {
      byName.push(n.id)
    }
  }
  if (byName.length > 0) return byName

  const byShortOrCode: string[] = []
  for (const n of nodes) {
    const sn = normSkillField(n.short_name ?? '')
    const code = normSkillField(n.skill_cke_code ?? '')
    if ((sn && sn.includes(q)) || (code && code.includes(q))) {
      byShortOrCode.push(n.id)
    }
  }
  return byShortOrCode
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
  dataset: GraphDataset
  /** When set, search / save controls render here (e.g. app header). */
  toolbarPortalEl?: HTMLElement | null
  onTopicsLoaded?: (topics: GraphResponse['topics']) => void
  onSummaryLoaded?: (summary: { topics: number; skills: number }) => void
  highlightTopicId?: number | null
}) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [savedPositions, setSavedPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })
  const [edgeMutationState, setEdgeMutationState] = useState<EdgeMutationState>({ kind: 'idle' })
  const [selectedSkill, setSelectedSkill] = useState<SelectedSkillDetail | null>(null)
  const [skillSearchInput, setSkillSearchInput] = useState('')
  const [searchHighlightIds, setSearchHighlightIds] = useState<string[]>([])
  const [skillSearchMessage, setSkillSearchMessage] = useState<string | null>(null)
  const reactFlowRef = useRef<ReactFlowInstance | null>(null)
  const { dataset, toolbarPortalEl, onTopicsLoaded, onSummaryLoaded, highlightTopicId } = props
  const { width, height } = useWindowSize()

  useEffect(() => {
    const ctrl = new AbortController()
    Promise.all([
      fetchSkillsGraph(dataset, ctrl.signal),
      fetchNodePositions(dataset, ctrl.signal).catch(() => ({} as Record<string, { x: number; y: number }>)),
    ])
      .then(([data, positions]) => {
        if (data.dataset != null && data.dataset !== dataset) {
          throw new Error(
            `Graph dataset mismatch: requested ${dataset}, API returned ${data.dataset}. Try a hard refresh or restart the API.`,
          )
        }
        setState({ kind: 'ready', data })
        setSavedPositions(positions)
        onTopicsLoaded?.(data.topics)
        onSummaryLoaded?.({ topics: data.topics.length, skills: data.nodes.length })
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load graph'
        setState({ kind: 'error', message: msg })
      })
    return () => ctrl.abort()
  }, [dataset, onTopicsLoaded, onSummaryLoaded])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const skillIdByNodeId = useMemo(() => {
    if (state.kind !== 'ready') return new Map<string, number>()
    return new Map(state.data.nodes.map((n) => [n.id, n.skill_id] as const))
  }, [state])
  const hasUnsavedChanges = useMemo(() => {
    if (nodes.length === 0) return false
    return nodes.some((node) => {
      const saved = savedPositions[node.id]
      if (!saved) return true
      return saved.x !== node.position.x || saved.y !== node.position.y
    })
  }, [nodes, savedPositions])

  const onFlowInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowRef.current = instance
  }, [])

  const runSkillSearch = useCallback(() => {
    if (state.kind !== 'ready') return
    if (!skillSearchInput.trim()) {
      setSearchHighlightIds([])
      setSkillSearchMessage(null)
      return
    }
    const ids = findSkillNodeIdsByQuery(state.data.nodes, skillSearchInput)
    if (ids.length === 0) {
      setSearchHighlightIds([])
      setSkillSearchMessage('No matching skill')
      return
    }
    setSearchHighlightIds(ids)
    setSkillSearchMessage(ids.length === 1 ? '1 match' : `${ids.length} matches`)
  }, [state, skillSearchInput])

  const clearSkillSearch = useCallback(() => {
    setSkillSearchInput('')
    setSearchHighlightIds([])
    setSkillSearchMessage(null)
  }, [])

  useEffect(() => {
    if (searchHighlightIds.length === 0) return
    const inst = reactFlowRef.current
    if (!inst) return
    const t = window.setTimeout(() => {
      if (!inst.viewportInitialized) return
      void inst.fitView({
        nodes: searchHighlightIds.map((id) => ({ id })),
        padding: 0.55,
        maxZoom: 1,
        duration: 400,
      })
    }, 0)
    return () => window.clearTimeout(t)
  }, [searchHighlightIds])

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
    const layout = layoutSkillsByTopic({
      topics: state.data.topics,
      nodes: state.data.nodes,
      viewportWidth: Math.max(400, width - 320),
      viewportHeight: height,
    })

    setNodes((prev) => {
      const posById = new Map(prev.map((n) => [n.id, n.position]))
      return layout.positioned.map((n) => {
        const { style, zIndex } = skillNodeChromeStyle(
          n.topic_cke_code,
          n.topic_id,
          highlightTopicId,
          false
        )
        return {
          id: n.id,
          type: 'skill' as const,
          position: posById.get(n.id) ?? savedPositions[n.id] ?? { x: n.x, y: n.y },
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
          zIndex,
          style,
        }
      })
    })

    const nodeYById = new Map(layout.positioned.map((n) => [n.id, savedPositions[n.id]?.y ?? n.y] as const))
    const edgesRf: Edge[] = (state.data.edges ?? []).map((e, idx) => {
      const sourceSelected = selectedIds?.has(e.source) ?? false
      const targetSelected = selectedIds?.has(e.target) ?? false
      const bothSelected = sourceSelected && targetSelected
      const handles = getHandlesByNodeY(nodeYById.get(e.source), nodeYById.get(e.target))

      return {
        id: e.id ?? `e-${idx}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        sourceHandle: handles.sourceHandle,
        targetHandle: handles.targetHandle,
        markerEnd: { type: MarkerType.ArrowClosed, width: 24, height: 24, color: '#000000' },
        style:
          highlightTopicId == null
            ? { stroke: '#000000' }
            : {
                stroke: '#000000',
                strokeWidth: bothSelected ? 1.6 : 0.8,
                opacity: bothSelected ? 0.85 : 0.15,
                transition: 'opacity 120ms ease, stroke-width 120ms ease, stroke 120ms ease',
              },
        selectable: true,
        draggable: false,
      }
    })
    setEdges(edgesRf)
    // Note: `savedPositions` and `searchHighlightIds` are intentionally omitted from deps. Updating
    // them would rebuild edges from `state.data.edges` only and drop edges added via onConnect.
  }, [state, width, height, highlightTopicId, setNodes, setEdges])

  useEffect(() => {
    if (state.kind !== 'ready') return
    setNodes((prev) => {
      if (prev.length === 0) return prev
      let changed = false
      const next = prev.map((node) => {
        const sp = savedPositions[node.id]
        if (!sp) return node
        if (node.position.x === sp.x && node.position.y === sp.y) return node
        changed = true
        return { ...node, position: { x: sp.x, y: sp.y } }
      })
      return changed ? next : prev
    })
  }, [savedPositions, state.kind, setNodes])

  useEffect(() => {
    if (state.kind !== 'ready') return
    const topicIdByNodeId = new Map(state.data.nodes.map((n) => [n.id, n.topic_id] as const))
    const searchHit = new Set(searchHighlightIds)

    setNodes((prev) => {
      if (prev.length === 0) return prev
      return prev.map((node) => {
        if (node.type !== 'skill') return node
        const topicId = topicIdByNodeId.get(node.id)
        if (topicId == null) return node
        const d = node.data as SkillFlowNodeData
        const { style, zIndex } = skillNodeChromeStyle(
          d.topic_cke_code,
          topicId,
          highlightTopicId,
          searchHit.has(node.id)
        )
        return { ...node, style, zIndex }
      })
    })
  }, [searchHighlightIds, highlightTopicId, state, setNodes, width, height])

  useEffect(() => {
    if (nodes.length === 0 || edges.length === 0) return
    const yById = new Map(nodes.map((n) => [n.id, n.position.y] as const))
    setEdges((prev) => {
      let changed = false
      const next = prev.map((edge) => {
        const handles = getHandlesByNodeY(yById.get(edge.source), yById.get(edge.target))
        if (edge.sourceHandle === handles.sourceHandle && edge.targetHandle === handles.targetHandle) {
          return edge
        }
        changed = true
        return { ...edge, sourceHandle: handles.sourceHandle, targetHandle: handles.targetHandle }
      })
      return changed ? next : prev
    })
  }, [nodes, edges.length, setEdges])

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

  const onConnect = useCallback(
    async (connection: Connection) => {
      const source = connection.source
      const target = connection.target
      if (source == null || target == null || source === target) {
        return
      }

      const sourceSkillId = skillIdByNodeId.get(source)
      const targetSkillId = skillIdByNodeId.get(target)
      if (sourceSkillId == null || targetSkillId == null) {
        setEdgeMutationState({ kind: 'error', message: 'Cannot resolve skill IDs for selected edge' })
        return
      }

      const edgeId = `temp-${source}-${target}-${Date.now()}`
      const sourceNode = nodes.find((n) => n.id === source)
      const targetNode = nodes.find((n) => n.id === target)
      const handles = getHandlesByNodeY(sourceNode?.position.y, targetNode?.position.y)
      setEdges((prev) =>
        addEdge(
          {
            id: edgeId,
            source,
            target,
            sourceHandle: handles.sourceHandle,
            targetHandle: handles.targetHandle,
            markerEnd: { type: MarkerType.ArrowClosed, width: 24, height: 24, color: '#000000' },
            style: { stroke: '#000000' },
            selectable: true,
          },
          prev
        )
      )
      setEdgeMutationState({ kind: 'saving' })
      try {
        await createSkillPrerequisite(dataset, {
          source_skill_id: sourceSkillId,
          target_skill_id: targetSkillId,
        })
        setEdgeMutationState({ kind: 'saved' })
      } catch (err: unknown) {
        setEdges((prev) => prev.filter((e) => e.id !== edgeId))
        const message = err instanceof Error ? err.message : 'Failed to create edge'
        setEdgeMutationState({ kind: 'error', message })
      }
    },
    [dataset, setEdges, skillIdByNodeId, nodes]
  )

  const onEdgesDelete = useCallback(
    async (deletedEdges: Edge[]) => {
      if (deletedEdges.length === 0) return
      setEdgeMutationState({ kind: 'saving' })
      try {
        await Promise.all(
          deletedEdges.map((edge) => {
            const sourceSkillId = skillIdByNodeId.get(edge.source)
            const targetSkillId = skillIdByNodeId.get(edge.target)
            if (sourceSkillId == null || targetSkillId == null) {
              throw new Error('Cannot resolve skill IDs for selected edge')
            }
            return deleteSkillPrerequisite(dataset, {
              source_skill_id: sourceSkillId,
              target_skill_id: targetSkillId,
            })
          })
        )
        setEdgeMutationState({ kind: 'saved' })
      } catch (err: unknown) {
        setEdges((prev) => [...prev, ...deletedEdges])
        const message = err instanceof Error ? err.message : 'Failed to delete edge'
        setEdgeMutationState({ kind: 'error', message })
      }
    },
    [dataset, setEdges, skillIdByNodeId]
  )

  const onSavePositions = useCallback(async () => {
    const positions = Object.fromEntries(nodes.map((node) => [node.id, node.position]))
    setSaveState({ kind: 'saving' })
    try {
      await saveNodePositions(dataset, { positions })
      setSavedPositions(positions)
      setSaveState({ kind: 'saved' })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save positions'
      setSaveState({ kind: 'error', message })
    }
  }, [dataset, nodes])

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
      {toolbarPortalEl != null &&
        createPortal(
          <div className="topBarToolbar">
            <div className="graphSearchGroup">
              <input
                type="search"
                className="graphSearchInput"
                placeholder="Skill name or code…"
                aria-label="Find skill by name or code"
                value={skillSearchInput}
                disabled={state.kind !== 'ready'}
                onChange={(e) => {
                  setSkillSearchInput(e.target.value)
                  if (skillSearchMessage === 'No matching skill') {
                    setSkillSearchMessage(null)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    runSkillSearch()
                  }
                }}
              />
              <button
                type="button"
                className="graphSearchButton"
                disabled={state.kind !== 'ready'}
                onClick={runSkillSearch}
              >
                Find
              </button>
              <button
                type="button"
                className="graphSearchButton graphSearchButtonMuted"
                disabled={
                  state.kind !== 'ready' || (!skillSearchInput.trim() && searchHighlightIds.length === 0)
                }
                onClick={clearSkillSearch}
              >
                Clear
              </button>
              {skillSearchMessage != null && (
                <span
                  className={
                    skillSearchMessage === 'No matching skill'
                      ? 'graphSearchFeedback graphSearchFeedbackError'
                      : 'graphSearchFeedback'
                  }
                >
                  {skillSearchMessage}
                </span>
              )}
            </div>
            <button
              type="button"
              className="graphSaveButton"
              disabled={state.kind !== 'ready' || saveState.kind === 'saving' || !hasUnsavedChanges}
              onClick={onSavePositions}
            >
              {saveState.kind === 'saving' ? 'Saving…' : 'Save positions'}
            </button>
            {hasUnsavedChanges && <span className="graphSaveStatus graphSaveStatusWarning">Unsaved changes</span>}
            {saveState.kind === 'saved' && !hasUnsavedChanges && <span className="graphSaveStatus">Saved</span>}
            {saveState.kind === 'error' && (
              <span className="graphSaveStatus graphSaveStatusError">{saveState.message}</span>
            )}
            {edgeMutationState.kind === 'saving' && <span className="graphSaveStatus">Saving edge…</span>}
            {edgeMutationState.kind === 'saved' && <span className="graphSaveStatus">Edge saved</span>}
            {edgeMutationState.kind === 'error' && (
              <span className="graphSaveStatus graphSaveStatusError">{edgeMutationState.message}</span>
            )}
          </div>,
          toolbarPortalEl
        )}
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
        elementsSelectable
        selectionOnDrag
        selectionKeyCode={['Shift']}
        multiSelectionKeyCode={['Shift']}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        onNodeDragStart={onMoveStart}
        onNodeDragStop={onMoveEnd}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        deleteKeyCode={['Delete', 'Backspace']}
        onInit={onFlowInit}
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
            <dt>Skill code</dt>
            <dd>{selectedSkill.skill_cke_code || '—'}</dd>
            <dt>Topic</dt>
            <dd>
              <span className="skillDetailTopicName">{selectedSkill.topic_name || '—'}</span>
              <span className="skillDetailTopicMeta">
                {' '}
                (topic code {selectedSkill.topic_cke_code}, grades {selectedSkill.grade_from}–
                {selectedSkill.grade_to})
              </span>
            </dd>
          </dl>
        </div>
      )}
    </div>
  )
}

