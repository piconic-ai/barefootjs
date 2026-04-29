/**
 * Stable CSS class names for xyflow primitives.
 *
 * Exported as constants so the registry-side `<Flow>` / `<Background>` /
 * etc. can reference them via `className={BF_FLOW}` instead of
 * `className="bf-flow"`. site/ui's `cssLayerPrefixer` only rewrites
 * locally-declared static `className` literals; imported identifiers are
 * left alone, which keeps `bf-flow*` un-prefixed for the e2e selectors
 * (the same trick chart uses with `CHART_CLASS_GRID` etc.).
 */

export const BF_FLOW = 'bf-flow'
export const BF_FLOW_VIEWPORT = 'bf-flow__viewport'
export const BF_FLOW_EDGES = 'bf-flow__edges'
export const BF_FLOW_NODES = 'bf-flow__nodes'

export const BF_FLOW_NODE = 'bf-flow__node'
export const BF_FLOW_NODE_GROUP = 'bf-flow__node--group'
export const BF_FLOW_NODE_CHILD = 'bf-flow__node--child'
export const BF_FLOW_NODE_SELECTED = 'bf-flow__node--selected'

export const BF_FLOW_EDGE = 'bf-flow__edge'
export const BF_FLOW_EDGE_SELECTED = 'bf-flow__edge--selected'
export const BF_FLOW_EDGE_ANIMATED = 'bf-flow__edge--animated'

export const BF_FLOW_HANDLE = 'bf-flow__handle'
export const BF_FLOW_HANDLE_TARGET = 'bf-flow__handle--target'
export const BF_FLOW_HANDLE_SOURCE = 'bf-flow__handle--source'

export const BF_FLOW_CONTROLS = 'bf-flow__controls'
export const BF_FLOW_CONTROLS_BUTTON = 'bf-flow__controls-button'

export const BF_FLOW_MINIMAP = 'bf-flow__minimap'
export const BF_FLOW_MINIMAP_MASK = 'bf-flow__minimap-mask'

// `xyflow__viewport` is a @xyflow/system compatibility class kept on the
// viewport wrapper.
export const XYFLOW_VIEWPORT = 'xyflow__viewport'
