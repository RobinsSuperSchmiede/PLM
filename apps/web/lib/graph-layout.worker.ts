/**
 * Force layout of the knowledge graph, off the main thread. The page sends the nodes and edges, this
 * worker runs the physics and posts back the positions (one Float32Array [x0, y0, x1, y1, ...] in the
 * order of the nodes it received), so panning, zooming and typing stay fluid with many nodes.
 */
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';

export type LayoutNode = { id: string; radius: number; x?: number; y?: number };
export type LayoutEdge = { source: string; target: string; distance: number };

export type LayoutRequest =
  /** Start a new layout. `once` computes the final layout in one go (large graphs) instead of animating. */
  | { type: 'init'; generation: number; nodes: LayoutNode[]; edges: LayoutEdge[]; once: boolean }
  /** Pin a node to a position while it is dragged. */
  | { type: 'drag'; id: string; x: number; y: number }
  | { type: 'release'; id: string }
  | { type: 'stop' };

export type LayoutResponse = { type: 'positions'; generation: number; positions: Float32Array; settled: boolean };

type SimNode = SimulationNodeDatum & LayoutNode;
type SimEdge = SimulationLinkDatum<SimNode>;

const scope = self as unknown as {
  postMessage(message: LayoutResponse, transfer: Transferable[]): void;
  onmessage: ((event: MessageEvent<LayoutRequest>) => void) | null;
};

let simulation: Simulation<SimNode, SimEdge> | null = null;
let nodes: SimNode[] = [];
let byId = new Map<string, SimNode>();

function post(generation: number, settled: boolean) {
  const positions = new Float32Array(nodes.length * 2);
  for (let index = 0; index < nodes.length; index += 1) {
    positions[index * 2] = nodes[index].x ?? 0;
    positions[index * 2 + 1] = nodes[index].y ?? 0;
  }
  scope.postMessage({ type: 'positions', generation, positions, settled }, [positions.buffer]);
}

scope.onmessage = ({ data: message }) => {
  if (message.type === 'init') {
    simulation?.stop();
    nodes = message.nodes.map((node) => ({ ...node }));
    byId = new Map(nodes.map((node) => [node.id, node]));
    const edges = message.edges.map((edge) => ({ ...edge }));
    const { generation } = message;
    const sim = forceSimulation<SimNode, SimEdge>(nodes)
      .force('link', forceLink<SimNode, SimEdge>(edges).id((node) => node.id).distance((edge) => (edge as unknown as LayoutEdge).distance).strength(0.5))
      .force('charge', forceManyBody().strength(-220))
      .force('center', forceCenter(0, 0))
      .force('x', forceX(0).strength(0.04))
      .force('y', forceY(0).strength(0.04))
      .force('collide', forceCollide<SimNode>().radius((node) => node.radius + 6))
      .stop();
    simulation = sim;
    if (message.once) {
      // Fewer iterations than d3's default are enough for a readable layout of large graphs.
      sim.tick(Math.min(220, Math.ceil(Math.log(sim.alphaMin()) / Math.log(1 - sim.alphaDecay()))));
      post(generation, true);
    } else {
      sim.on('tick', () => post(generation, false)).on('end', () => post(generation, true)).restart();
    }
  } else if (message.type === 'drag') {
    const node = byId.get(message.id);
    if (!node || !simulation) return;
    node.fx = message.x;
    node.fy = message.y;
    simulation.alphaTarget(0.2).restart();
  } else if (message.type === 'release') {
    const node = byId.get(message.id);
    if (node) {
      node.fx = null;
      node.fy = null;
    }
    simulation?.alphaTarget(0);
  } else {
    simulation?.stop();
  }
};
