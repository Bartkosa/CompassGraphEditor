import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'

export type SkillFlowNodeData = {
  label: string
  short_name: string
  name: string
  topic_name: string
  topic_cke_code: string
  grade_from: number
  grade_to: number
  skill_cke_code: string
}

export type SkillFlowNodeType = Node<SkillFlowNodeData, 'skill'>

/**
 * Single-line label so fixed vertical layout steps don't collide when long
 * Polish skill names wrap to 2–3 lines on default nodes.
 */
export const SkillFlowNode = memo(function SkillFlowNode(props: NodeProps<SkillFlowNodeType>) {
  const { data } = props
  const label = String(data?.label ?? '')

  return (
    <div className="skill-flow-node" title={label}>
      <Handle id="target-top" type="target" position={Position.Top} />
      <Handle id="source-top" type="source" position={Position.Top} />
      <div
        style={{
          whiteSpace: 'normal',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 110,
          fontSize: 11,
          lineHeight: 1.35,
          textAlign: 'center',
        }}
      >
        {label}
      </div>
      <Handle id="target-bottom" type="target" position={Position.Bottom} />
      <Handle id="source-bottom" type="source" position={Position.Bottom} />
    </div>
  )
})
