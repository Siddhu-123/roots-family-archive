import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Handle, Position, Background, BackgroundVariant, MiniMap, Panel, useReactFlow, type Node, type NodeProps, type Edge } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import { Plus, Minus, Maximize, LocateFixed, Network, RotateCcw, GitBranch, ChevronDown } from 'lucide-react';
import { displayName, lifeSpan, type Archive, type Person } from './model';
import { Avatar, IconButton, Button, Empty, useMedia } from './ui';

type MemberData = { person: Person; order: Archive['settings']['nameOrder']; selected: boolean; dimmed: boolean; root: boolean; select: (id: string) => void; add: (id: string) => void; [key: string]: unknown };
type MemberNode = Node<MemberData, 'member'>;
export const MemberCard = memo(function MemberCard({ data }: NodeProps<MemberNode>) {
  return <div className={`tree-person ${data.selected ? 'selected' : ''} ${data.dimmed ? 'dimmed' : ''}`}>
    <Handle type="target" position={Position.Top} id="top"/><Handle type="source" position={Position.Bottom} id="bottom"/>
    <Handle type="source" position={Position.Right} id="right"/><Handle type="target" position={Position.Left} id="left"/>
    <button className="node-main nodrag nopan" onClick={() => data.select(data.person.id)} aria-label={`View ${displayName(data.person, data.order)}`}><Avatar person={data.person}/><span className="node-details"><strong>{displayName(data.person, data.order)}</strong><span>{data.person.knownAs || data.person.nativeName || data.person.occupation || data.person.ancestralVillage || 'Family member'}</span><small>{lifeSpan(data.person)}</small></span></button>
    {data.root && <span className="node-root">Starting person</span>}
    <button className="node-add nodrag nopan" aria-label={`Add a relative of ${data.person.givenName}`} title="Add relative" onClick={e => { e.stopPropagation(); data.add(data.person.id); }}><Plus size={15}/></button>
  </div>;
});
const nodeTypes = { member: MemberCard };
function filteredIds(archive: Archive, focus: string, mode: string) {
  if (mode === 'all' || !focus) return new Set(archive.people.map(p => p.id));
  const found = new Set<string>([focus]), queue = [focus];
  for (let i = 0; i < queue.length; i++) {
    for (const r of archive.relationships.filter(r => r.type === 'parent')) {
      const next = mode === 'ancestors' && r.to === queue[i] ? r.from : mode === 'descendants' && r.from === queue[i] ? r.to : '';
      if (next && !found.has(next)) { found.add(next); queue.push(next); }
    }
  }
  for (const r of archive.relationships.filter(r => r.type === 'partner')) {
    if (found.has(r.from)) found.add(r.to); else if (found.has(r.to)) found.add(r.from);
  }
  return found;
}
export function layoutFamily(archive: Archive, ids = new Set(archive.people.map(p => p.id))) {
  const people = archive.people.filter(p => ids.has(p.id));
  const parents = new Map(people.map(p => [p.id, p.id]));
  const groupOf = (id: string): string => {
    let result = id; while (parents.get(result) && parents.get(result) !== result) result = parents.get(result)!; return result;
  };
  const links = archive.relationships.filter(r => ids.has(r.from) && ids.has(r.to));
  for (const r of links.filter(r => r.type === 'partner')) parents.set(groupOf(r.to), groupOf(r.from));
  const groups = new Map<string, Person[]>();
  people.forEach(p => { const g = groupOf(p.id); groups.set(g, [...(groups.get(g) || []), p]); });
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'TB', ranksep: 105, nodesep: 70, edgesep: 22, marginx: 30, marginy: 35 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const [id, members] of groups) graph.setNode(id, { width: members.length * 232 + (members.length - 1) * 34, height: 114 });
  for (const r of links.filter(r => r.type === 'parent')) if (groupOf(r.from) !== groupOf(r.to)) graph.setEdge(groupOf(r.from), groupOf(r.to));
  dagre.layout(graph);
  const positions = new Map<string, { x: number; y: number }>();
  for (const [id, members] of groups) {
    const pos = graph.node(id), width = members.length * 232 + (members.length - 1) * 34;
    members.forEach((p, i) => positions.set(p.id, { x: pos.x - width / 2 + i * 266, y: pos.y - 57 }));
  }
  return { people, links, positions };
}
function TreeCanvas({ archive, selectedId, query, onSelect, onAdd, onStart }: { archive: Archive; selectedId: string; query: string; onSelect: (id: string) => void; onAdd: (id: string) => void; onStart: () => void }) {
  const [mode, setMode] = useState('all'), [focus, setFocus] = useState(archive.rootPersonId), [fitKey, setFitKey] = useState(0), [zoom, setZoom] = useState(100);
  const { fitView, getNode, zoomIn, zoomOut, setCenter } = useReactFlow();
  const wide = useMedia('(min-width: 900px)');
  useEffect(() => { if (!archive.people.some(p => p.id === focus)) setFocus(archive.rootPersonId); }, [archive.rootPersonId, archive.people, focus]);
  const layout = useMemo(() => layoutFamily(archive, filteredIds(archive, focus, mode)), [archive.people, archive.relationships, focus, mode]);
  const nodes: MemberNode[] = layout.people.map(p => ({ id: p.id, type: 'member', position: layout.positions.get(p.id)!, width: 232, height: 114, draggable: false,
    data: { person: p, order: archive.settings.nameOrder, selected: p.id === selectedId, dimmed: !!query && ![p.givenName,p.surname,p.nativeName,p.knownAs,p.gothram,p.ancestralVillage,p.occupation].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()), root: p.id === archive.rootPersonId, select: onSelect, add: onAdd } }));
  const edges: Edge[] = layout.links.map(r => {
    const fromPos = layout.positions.get(r.from)!, toPos = layout.positions.get(r.to)!;
    const forward = fromPos.x < toPos.x;
    return { id: r.id, source: r.type === 'parent' || forward ? r.from : r.to, target: r.type === 'parent' || forward ? r.to : r.from,
      sourceHandle: r.type === 'parent' ? 'bottom' : 'right', targetHandle: r.type === 'parent' ? 'top' : 'left', type: 'smoothstep',
      style: { stroke: r.type === 'partner' ? '#e99269' : r.type === 'sibling' ? '#439a9a' : '#b5bec9', strokeWidth: r.type === 'partner' ? 2 : 1.7, strokeDasharray: r.type === 'parent' && r.parentKind === 'biological' ? undefined : '5 4' },
      ariaLabel: `${r.type} relationship`, selectable: false,
    };
  });
  const structureKey = layout.people.map(p => {
    const point = layout.positions.get(p.id)!;
    return `${p.id}:${point.x}:${point.y}`;
  }).join('|') + mode + focus;
  const flowRef = useRef<HTMLDivElement>(null), previousFlowWidth = useRef(0), previousSelectedId = useRef(selectedId);
  const [resizeFocus, setResizeFocus] = useState(0);
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const duration = (milliseconds: number) => reducedMotion ? 0 : milliseconds;
  const centerPerson = (id: string) => {
    const node = getNode(id);
    if (node) void setCenter(node.position.x + (node.width ?? 232) / 2, node.position.y + (node.height ?? 114) / 2, { zoom: 1, duration: duration(350) });
  };
  useEffect(() => {
    const element = flowRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (previousFlowWidth.current && Math.abs(width - previousFlowWidth.current) > 1) setResizeFocus(key => key + 1);
      previousFlowWidth.current = width;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { const t = setTimeout(() => {
    const animation = duration(350);
    if (fitKey === 0 && !wide) {
      const p = layout.positions.get(focus);
      if (p) void setCenter(p.x + 116, p.y + 57, { zoom: 0.82, duration: animation });
      else void fitView({ padding: 0.15, duration: animation, maxZoom: 1 });
    } else void fitView({ padding: 0.15, duration: animation, maxZoom: 1 });
  }, 100); return () => clearTimeout(t); }, [structureKey, fitKey, fitView, wide, focus, setCenter, reducedMotion]);
  useEffect(() => {
    if (previousSelectedId.current !== selectedId) {
      previousSelectedId.current = selectedId;
      if (selectedId) { const t = setTimeout(() => centerPerson(selectedId), 120); return () => clearTimeout(t); }
    }
  }, [selectedId, getNode, setCenter, reducedMotion]);
  useEffect(() => {
    if (resizeFocus && selectedId) { const t = setTimeout(() => centerPerson(selectedId), 120); return () => clearTimeout(t); }
  }, [resizeFocus, selectedId, getNode, setCenter, reducedMotion]);
  const centerSelected = () => centerPerson(selectedId || focus);
  if (!archive.people.length) return <Empty icon={<GitBranch size={34}/>} title="Every family tree starts with one person" action={<Button variant="primary" onClick={onStart}><Plus size={17}/>Add the first member</Button>}/>;
  return <div className="tree-surface" data-testid="tree-surface">
    <div className="tree-toolbar"><div className="segmented" aria-label="Tree scope">{[['all','Whole family'],['ancestors','Ancestors'],['descendants','Descendants']].map(([value,label]) => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</button>)}</div><label className="focus-select"><LocateFixed size={15}/><select aria-label="Starting person for this view" value={focus} onChange={e => setFocus(e.target.value)}>{archive.people.map(p => <option key={p.id} value={p.id}>{displayName(p,archive.settings.nameOrder)}</option>)}</select></label></div>
    <div ref={flowRef} className="tree-flow"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} minZoom={0.12} maxZoom={1.7} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} deleteKeyCode={null} panOnScroll zoomOnScroll={false} zoomOnPinch preventScrolling onMove={(_, v) => setZoom(Math.round(v.zoom * 100))} ariaLabelConfig={{ 'node.a11yDescription.default': 'Open family member details.' }}>
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.1} color="#dce1e7"/>
      <Panel position="bottom-left"><div className="canvas-controls"><IconButton label="Zoom in" onClick={() => void zoomIn({ duration: duration(200) })}><Plus size={17}/></IconButton><span>{zoom}%</span><IconButton label="Zoom out" onClick={() => void zoomOut({ duration: duration(200) })}><Minus size={17}/></IconButton><span className="control-divider"/><IconButton label="Fit whole tree" onClick={() => setFitKey(k => k + 1)}><Maximize size={17}/></IconButton><IconButton label="Focus selected member" onClick={centerSelected}><LocateFixed size={17}/></IconButton></div></Panel>
      {wide && <MiniMap position="bottom-right" pannable zoomable nodeColor={n => n.id === selectedId ? '#e85c20' : '#d3dae3'} maskColor="rgba(248,249,251,.7)"/>}
    </ReactFlow></div>
    <div className="tree-legend"><span><i className="legend-line"/>Parent & child</span><span><i className="legend-line partner"/>Spouse / partner</span><span><i className="legend-line other"/>Other / not confirmed</span><span className="tree-person-count">{nodes.length} members in view</span></div>
  </div>;
}
export function TreeView(props: Parameters<typeof TreeCanvas>[0]) { return <ReactFlowProvider><TreeCanvas {...props}/></ReactFlowProvider>; }
