import { useMemo, useCallback, type MouseEvent as ReactMouseEvent } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";

// ---------------------------------------------------------------------------
// VMP domain types (SPEC section 5.8 / 5.11)
// ---------------------------------------------------------------------------

/** Minimal shape of ecm:Instance for canvas binding. */
interface EcmInstance {
  id: string;
  "ecm:classIris": string[];
}

/** Minimal shape of ecm:RelationAssertion for canvas binding. */
interface EcmRelation {
  id: string;
  "ecm:subjectIri": string;
  "ecm:predicateIri": string;
  "ecm:objectIri": string;
}

/** ecm:CanvasNode entry from a layout's ecm:nodes array (SPEC section 5.11). */
interface EcmCanvasNode {
  "ecm:instanceIri": string;
  "ecm:x": number;
  "ecm:y": number;
  "ecm:width"?: number;
  "ecm:height"?: number;
}

// ---------------------------------------------------------------------------
// React Flow typed node / edge data (gap-13: extend Record<string,unknown>)
// ---------------------------------------------------------------------------

/** Data bag for a React Flow node derived from ecm:Instance. */
interface InstanceNodeData extends Record<string, unknown> {
  instanceIri: string;
  classIris: string[];
}

/** Data bag for a React Flow edge derived from ecm:RelationAssertion. */
interface RelationEdgeData extends Record<string, unknown> {
  relationId: string;
  predicateIri: string;
}

type InstanceNode = Node<InstanceNodeData>;
type RelationEdge = Edge<RelationEdgeData>;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isEcmInstance(v: unknown): v is EcmInstance {
  if (v === null || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj["id"] === "string" &&
    obj["type"] === "ecm:Instance" &&
    Array.isArray(obj["ecm:classIris"])
  );
}

function isEcmRelation(v: unknown): v is EcmRelation {
  if (v === null || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj["id"] === "string" &&
    obj["type"] === "ecm:RelationAssertion" &&
    typeof obj["ecm:subjectIri"] === "string" &&
    typeof obj["ecm:objectIri"] === "string" &&
    typeof obj["ecm:predicateIri"] === "string"
  );
}

function isEcmCanvasNode(v: unknown): v is EcmCanvasNode {
  if (v === null || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    obj["type"] === "ecm:CanvasNode" &&
    typeof obj["ecm:instanceIri"] === "string" &&
    typeof obj["ecm:x"] === "number" &&
    typeof obj["ecm:y"] === "number"
  );
}

// ---------------------------------------------------------------------------
// Derivation: ecm:instances -> React Flow nodes
// ---------------------------------------------------------------------------

const AUTO_COL_WIDTH = 260;
const AUTO_ROW_HEIGHT = 160;
const AUTO_COLS = 5;

function deriveNodes(project: Record<string, unknown>): InstanceNode[] {
  const rawInstances = Array.isArray(project["ecm:instances"])
    ? (project["ecm:instances"] as unknown[])
    : [];
  const rawLayouts = Array.isArray(project["ecm:layouts"])
    ? (project["ecm:layouts"] as unknown[])
    : [];

  // First valid ecm:CanvasLayout is the active layout (SPEC section 5.11;
  // multi-layout selection policy is an open question deferred to a future chain).
  const activeLayout =
    rawLayouts.find(
      (l): l is Record<string, unknown> =>
        l !== null &&
        typeof l === "object" &&
        (l as Record<string, unknown>)["type"] === "ecm:CanvasLayout",
    ) ?? null;

  const posMap = new Map<string, { x: number; y: number }>();
  if (activeLayout !== null) {
    const rawNodes = Array.isArray(activeLayout["ecm:nodes"])
      ? (activeLayout["ecm:nodes"] as unknown[])
      : [];
    for (const cn of rawNodes) {
      if (isEcmCanvasNode(cn)) {
        posMap.set(cn["ecm:instanceIri"], {
          x: cn["ecm:x"],
          y: cn["ecm:y"],
        });
      }
    }
  }

  return rawInstances.flatMap<InstanceNode>((inst, idx) => {
    if (!isEcmInstance(inst)) return [];
    const position = posMap.get(inst.id) ?? {
      x: (idx % AUTO_COLS) * AUTO_COL_WIDTH,
      y: Math.floor(idx / AUTO_COLS) * AUTO_ROW_HEIGHT,
    };
    return [
      {
        id: inst.id,
        position,
        data: { instanceIri: inst.id, classIris: inst["ecm:classIris"] },
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Derivation: ecm:relations -> React Flow edges
// ---------------------------------------------------------------------------

function deriveEdges(project: Record<string, unknown>): RelationEdge[] {
  const rawRelations = Array.isArray(project["ecm:relations"])
    ? (project["ecm:relations"] as unknown[])
    : [];

  return rawRelations.flatMap<RelationEdge>((rel) => {
    if (!isEcmRelation(rel)) return [];
    return [
      {
        id: rel.id,
        source: rel["ecm:subjectIri"],
        target: rel["ecm:objectIri"],
        data: { relationId: rel.id, predicateIri: rel["ecm:predicateIri"] },
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// CanvasView component
// ---------------------------------------------------------------------------

interface CanvasViewProps {
  project: Record<string, unknown> | null;
  /**
   * Called with the updated project document after an instance is created.
   * When undefined the double-click create gesture is disabled (read-only mode).
   */
  onProjectChange?: (project: Record<string, unknown>) => void;
  /** Called with the relation id when an edge is clicked; null signals deselect. */
  onEdgeSelect?: (relationId: string | null) => void;
  /** Called with the instance id when a node is clicked; null signals deselect. */
  onNodeSelect?: (instanceId: string | null) => void;
}

// ---------------------------------------------------------------------------
// Inner canvas: must be a child of ReactFlowProvider to call useReactFlow
// (screenToFlowPosition for coordinate conversion; SPEC section 5.11).
// ---------------------------------------------------------------------------

interface CanvasViewInnerProps {
  nodes: InstanceNode[];
  edges: RelationEdge[];
  project: Record<string, unknown>;
  onProjectChange?: (updated: Record<string, unknown>) => void;
  onEdgeSelect?: (relationId: string | null) => void;
  onNodeSelect?: (instanceId: string | null) => void;
}

function CanvasViewInner({
  nodes,
  edges,
  project,
  onProjectChange,
  onEdgeSelect,
  onNodeSelect,
}: CanvasViewInnerProps) {
  const { screenToFlowPosition } = useReactFlow();

  /**
   * onPaneClick fires on every click to the pane background (not on nodes).
   * event.detail === 2 distinguishes the second click of a double-click from
   * single clicks. One double-click => one ecm:Instance + ecm:CanvasNode.
   */
  const handlePaneClick = useCallback(
    (event: ReactMouseEvent) => {
      if (event.detail !== 2) return;
      if (onProjectChange === undefined) return;

      const pos = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const newIri = `urn:uuid:${crypto.randomUUID()}`;
      const now = new Date().toISOString();

      // Minimum-valid ecm:Instance (SPEC section 5.8 + isEcmInstance guard).
      const newInstance: Record<string, unknown> = {
        id: newIri,
        type: "ecm:Instance",
        "rdfs:label": "New Instance",
        "ecm:classIris": [],
        "ecm:createdAt": now,
        "ecm:updatedAt": now,
      };

      // ecm:CanvasNode with default dimensions matching fixture canon (SPEC 5.11).
      const newCanvasNode: Record<string, unknown> = {
        type: "ecm:CanvasNode",
        "ecm:instanceIri": newIri,
        "ecm:x": pos.x,
        "ecm:y": pos.y,
        "ecm:width": 220,
        "ecm:height": 120,
      };

      // Append to ecm:instances.
      const existingInstances = Array.isArray(project["ecm:instances"])
        ? (project["ecm:instances"] as unknown[])
        : [];

      // Find or create the first ecm:CanvasLayout; append the new canvas node.
      const existingLayouts = Array.isArray(project["ecm:layouts"])
        ? (project["ecm:layouts"] as unknown[])
        : [];
      const layoutIdx = existingLayouts.findIndex(
        (l): l is Record<string, unknown> =>
          l !== null &&
          typeof l === "object" &&
          (l as Record<string, unknown>)["type"] === "ecm:CanvasLayout",
      );
      let updatedLayouts: unknown[];
      if (layoutIdx >= 0) {
        const existing = existingLayouts[layoutIdx] as Record<string, unknown>;
        const existingNodes = Array.isArray(existing["ecm:nodes"])
          ? (existing["ecm:nodes"] as unknown[])
          : [];
        updatedLayouts = [
          ...existingLayouts.slice(0, layoutIdx),
          { ...existing, "ecm:nodes": [...existingNodes, newCanvasNode] },
          ...existingLayouts.slice(layoutIdx + 1),
        ];
      } else {
        updatedLayouts = [
          ...existingLayouts,
          {
            id: `urn:uuid:${crypto.randomUUID()}`,
            type: "ecm:CanvasLayout",
            "ecm:name": "Default Layout",
            "ecm:nodes": [newCanvasNode],
            "ecm:edges": [],
          },
        ];
      }

      onProjectChange({
        ...project,
        "ecm:instances": [...existingInstances, newInstance],
        "ecm:layouts": updatedLayouts,
      });
    },
    [onProjectChange, project, screenToFlowPosition],
  );

  /**
   * onNodeDragStop fires once when the user releases a dragged node.
   * Updates ecm:x / ecm:y on the matching ecm:CanvasNode (matched by
   * ecm:instanceIri === node.id) inside the active ecm:CanvasLayout.
   * Uses the same spread-replace pattern as handlePaneClick (Chain B).
   */
  const handleNodeDragStop = useCallback(
    (_event: ReactMouseEvent, node: InstanceNode) => {
      if (onProjectChange === undefined) return;

      const existingLayouts = Array.isArray(project["ecm:layouts"])
        ? (project["ecm:layouts"] as unknown[])
        : [];
      const layoutIdx = existingLayouts.findIndex(
        (l): l is Record<string, unknown> =>
          l !== null &&
          typeof l === "object" &&
          (l as Record<string, unknown>)["type"] === "ecm:CanvasLayout",
      );
      if (layoutIdx < 0) return;

      const existing = existingLayouts[layoutIdx] as Record<string, unknown>;
      const existingNodes = Array.isArray(existing["ecm:nodes"])
        ? (existing["ecm:nodes"] as unknown[])
        : [];

      // Guard: only update if the dragged node is actually in the layout.
      const hasMatch = existingNodes.some(
        (cn) =>
          cn !== null &&
          typeof cn === "object" &&
          (cn as Record<string, unknown>)["ecm:instanceIri"] === node.id,
      );
      if (!hasMatch) return;

      const updatedNodes = existingNodes.map((cn) => {
        if (
          cn !== null &&
          typeof cn === "object" &&
          (cn as Record<string, unknown>)["ecm:instanceIri"] === node.id
        ) {
          return {
            ...(cn as Record<string, unknown>),
            "ecm:x": node.position.x,
            "ecm:y": node.position.y,
          };
        }
        return cn;
      });

      const updatedLayouts = [
        ...existingLayouts.slice(0, layoutIdx),
        { ...existing, "ecm:nodes": updatedNodes },
        ...existingLayouts.slice(layoutIdx + 1),
      ];

      onProjectChange({
        ...project,
        "ecm:layouts": updatedLayouts,
      });
    },
    [onProjectChange, project],
  );

  /**
   * onConnect fires when the user drags from a source handle to a target node.
   * Creates a minimum-valid ecm:RelationAssertion (SPEC section 5.9).
   * ecm:predicateIri is set to the placeholder "ecm:UnassignedPredicate" so
   * the isEcmRelation type guard passes; the user assigns the real predicate
   * via the Inspector dropdown (FR-U015, task 2.6 Chain B).
   */
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (onProjectChange === undefined) return;
      const newRelId = `urn:uuid:${crypto.randomUUID()}`;
      const newRelation: Record<string, unknown> = {
        id: newRelId,
        type: "ecm:RelationAssertion",
        "ecm:subjectIri": connection.source,
        "ecm:predicateIri": "ecm:UnassignedPredicate",
        "ecm:objectIri": connection.target,
      };
      const existingRelations = Array.isArray(project["ecm:relations"])
        ? (project["ecm:relations"] as unknown[])
        : [];
      onProjectChange({
        ...project,
        "ecm:relations": [...existingRelations, newRelation],
      });
    },
    [onProjectChange, project],
  );

  /** onEdgeClick: notify parent of the selected relation id (FR-U015/U016/U017 wiring). */
  const handleEdgeClick = useCallback(
    (_event: ReactMouseEvent, edge: RelationEdge) => {
      onEdgeSelect?.(edge.id);
    },
    [onEdgeSelect],
  );

  /** onNodeClick: notify parent of the selected instance id (FR-U018/FR-U019 wiring). */
  const handleNodeClick = useCallback(
    (_event: ReactMouseEvent, node: InstanceNode) => {
      onNodeSelect?.(node.id);
    },
    [onNodeSelect],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodesDraggable={onProjectChange !== undefined}
      nodesConnectable={onProjectChange !== undefined}
      elementsSelectable={onProjectChange !== undefined}
      fitView={nodes.length > 0}
      onPaneClick={handlePaneClick}
      onNodeDragStop={handleNodeDragStop}
      onConnect={handleConnect}
      onEdgeClick={handleEdgeClick}
      onNodeClick={handleNodeClick}
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}

/**
 * Chain A/B canvas: derives React Flow nodes from ecm:instances and edges
 * from ecm:relations. Chain B wires onProjectChange for double-click create.
 * SPEC section 15.3 / section 4.2 / section 5.11.
 */
export function CanvasView({ project, onProjectChange, onEdgeSelect, onNodeSelect }: CanvasViewProps) {
  const nodes = useMemo<InstanceNode[]>(
    () => (project !== null ? deriveNodes(project) : []),
    [project],
  );
  const edges = useMemo<RelationEdge[]>(
    () => (project !== null ? deriveEdges(project) : []),
    [project],
  );

  if (project === null) {
    return (
      <p className="gw-placeholder" data-testid="gw-canvas-view">
        Open a project to view the canvas.
      </p>
    );
  }

  return (
    <div
      style={{ width: "100%", height: "100%" }}
      data-testid="gw-canvas-view"
    >
      <ReactFlowProvider>
        <CanvasViewInner
          nodes={nodes}
          edges={edges}
          project={project}
          onProjectChange={onProjectChange}
          onEdgeSelect={onEdgeSelect}
          onNodeSelect={onNodeSelect}
        />
      </ReactFlowProvider>
    </div>
  );
}
