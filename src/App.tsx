import { Component, useMemo, useState, type ErrorInfo, type ReactNode } from 'react';
import { BookOpen, CalendarDays, GitBranch, Heart, Menu as MenuIcon, MessageCircle, Search, Settings as SettingsIcon, Shield, Users, X, Plus, UserRound, Download, LoaderCircle } from 'lucide-react';
import { useArchive } from './storage';
import { newArchive, generationCount, type Person, type Memory } from './model';
import { TreeView } from './TreeView';
import { PeopleView } from './PeopleView';
import { MemoriesView, MemoryDialog } from './Memories';
import { InterviewView } from './Interview';
import { Profile } from './Profile';
import { PersonEditor, type PersonEditorTarget } from './PersonEditor';
import { RelationshipEditor } from './Relationships';
import { Timeline } from './Timeline';
import { Settings } from './Settings';
import { BackupsView } from './BackupsView';
import { Button, Confirm, IconButton, Modal, useMedia, errorText } from './ui';

type View = 'tree'|'people'|'memories'|'interview'|'timeline'|'backups'|'settings';
const nav: {id:View;label:string;icon:typeof GitBranch}[] = [
  {id:'tree',label:'Family tree',icon:GitBranch},{id:'people',label:'Members',icon:Users},{id:'memories',label:'Memories',icon:BookOpen},{id:'interview',label:'Conversations',icon:MessageCircle},{id:'timeline',label:'Timeline',icon:CalendarDays},{id:'backups',label:'Backups',icon:Shield},{id:'settings',label:'Settings',icon:SettingsIcon},
];
class ErrorBoundary extends Component<{children:ReactNode},{error:string}> {
  state={error:''}; static getDerivedStateFromError(e:unknown){return {error:errorText(e)}}; componentDidCatch(_e:Error,_i:ErrorInfo){}
  render(){return this.state.error?<main className="fatal"><h1>Roots needs to reload this view</h1><p>{this.state.error}</p><button onClick={()=>location.reload()}>Reload archive</button></main>:this.props.children}
}
export function App(){
  const {archive,commit,saving,error}=useArchive();
  const [view,setView]=useState<View>('tree'),[query,setQuery]=useState(''),[selected,setSelected]=useState(''),[editor,setEditor]=useState<PersonEditorTarget|null>(null),[relationship,setRelationship]=useState<string|null>(null),[memory,setMemory]=useState<{memory?:Memory;personIds?:string[]}|null>(null),[deletePerson,setDeletePerson]=useState<Person|null>(null),[startOpen,setStartOpen]=useState(false),[newTitle,setNewTitle]=useState('My family'),[startBusy,setStartBusy]=useState(false),[startError,setStartError]=useState(''),[mobileNav,setMobileNav]=useState(false);
  const wide=useMedia('(min-width: 1100px)'), mobile=useMedia('(max-width: 760px)');
  const selectedPerson=archive.people.find(p=>p.id===selected);
  const stats=useMemo(()=>({people:archive.people.length,memories:archive.memories.length,generations:generationCount(archive)}),[archive]);
  const select=(id:string)=>{setSelected(id);setView('tree');};
  const addFirst=()=>setEditor({});
  const onSaved=(id:string)=>{setSelected(id);setView('tree')};
  const newFamily=async()=>{if(!newTitle.trim()){setStartError('Enter a title for your family archive.');return}setStartBusy(true);setStartError('');try{await commit(()=>({...newArchive(newTitle.trim())}),`Started ${newTitle.trim()}`);setSelected('');setView('tree');setStartOpen(false);setEditor({});}catch(e){setStartError(errorText(e))}finally{setStartBusy(false)}};
  const openMemory=(m:Memory)=>setMemory({memory:m});
  const openProfile=(person:Person)=><Profile person={person} onClose={()=>setSelected('')} onEdit={p=>setEditor({person:p})} onAdd={id=>setEditor({anchorId:id})} onSelect={select} onConnect={id=>setRelationship(id)} onMemory={openMemory} onNewMemory={id=>setMemory({personIds:[id]})} onDelete={setDeletePerson} onRoot={async id=>{try{await commit(a=>{a.rootPersonId=id;return a},'Changed starting person')}catch{}}}/>;
  return <div className={`app-shell text-${archive.settings.textSize}`}>
    <aside className="sidebar"><div className="brand"><span className="brand-mark">r</span><span><strong>Roots</strong><small>Family Archive</small></span></div><div className="sidebar-label">ARCHIVE</div><nav aria-label="Archive navigation">{nav.map(item=>{const Icon=item.icon;return <button key={item.id} className={view===item.id?'active':''} onClick={()=>setView(item.id)}><Icon size={18}/><span>{item.label}</span>{item.id==='people'&&<small>{stats.people}</small>}</button>})}</nav><div className="sidebar-bottom"><span className="local-indicator"/><span>Saved on this device</span></div></aside>
    <main className="main-shell"><header className="topbar"><IconButton className="mobile-menu" label="Open navigation" onClick={()=>setMobileNav(true)}><MenuIcon size={19}/></IconButton><div className="breadcrumb">Roots <span>/</span> {nav.find(n=>n.id===view)?.label}</div><label className="global-search"><Search size={17}/><input aria-label="Search family archive" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search names, gothram, village…"/></label><div className="save-state">{saving?<><LoaderCircle size={15} className="spin"/>Saving</>:<><span/>Saved locally</>}</div></header>
      {error&&<div className="save-error" role="alert">{error}</div>}
      <div className="page-heading"><div><p className="eyebrow">{archive.demo?'SAMPLE RECORDS':'YOUR FAMILY ARCHIVE'}</p><h1>{view==='tree'?archive.title:nav.find(n=>n.id===view)?.label}</h1>{archive.demo&&<span className="sample-banner">Sample records · Start your own archive to replace them</span>}</div><div className="heading-actions">{view==='tree'&&<>{archive.demo&&<Button variant="primary" onClick={()=>setStartOpen(true)}><Heart size={15}/>Start my family</Button>}<Button onClick={()=>setRelationship(selected||archive.rootPersonId)} disabled={!archive.people.length}>Connect members</Button><Button variant="primary" onClick={()=>selected?setEditor({anchorId:selected}):addFirst()}><Plus size={16}/>{archive.people.length?'Add member':'Add first member'}</Button></>}{view==='people'&&<Button variant="primary" onClick={addFirst}><Plus size={16}/>Add member</Button>}{view==='memories'&&<Button variant="primary" onClick={()=>setMemory({})}><Plus size={16}/>Add memory</Button>}</div></div>
      <div className="stat-band"><div><strong>{stats.people}</strong><span>Family members</span></div><div><strong>{stats.generations}</strong><span>Generations</span></div><div><strong>{stats.memories}</strong><span>Memories saved</span></div>{!archive.people.length&&<Button variant="primary" onClick={()=>setStartOpen(true)}><Heart size={15}/>Start my family</Button>}</div>
      <div className={`workspace ${view==='tree'&&archive.people.length?'tree-workspace':''} ${selectedPerson&&view==='tree'&&wide?'with-profile':''}`}>
        <section className="view-content">
          {view==='tree'&&<TreeView archive={archive} selectedId={selected} query={query} onSelect={id=>setSelected(id)} onAdd={id=>setEditor({anchorId:id})} onStart={()=>setStartOpen(true)}/>}
          {view==='people'&&<PeopleView query={query} onSelect={select} onAdd={addFirst}/>}
          {view==='memories'&&<MemoriesView query={query} onOpen={openMemory} onAdd={()=>setMemory({})}/>}
          {view==='interview'&&<InterviewView onAddRelative={(id,source)=>setEditor({anchorId:id,source})} onOpenMemory={openMemory}/>}
          {view==='timeline'&&<Timeline onPerson={select} onMemory={id=>{const m=archive.memories.find(x=>x.id===id);if(m)openMemory(m)}}/>}
          {view==='backups'&&<BackupsView/>}{view==='settings'&&<Settings/>}
        </section>
        {selectedPerson&&view==='tree'&&wide&&<div className="desktop-profile">{openProfile(selectedPerson)}</div>}
      </div>
    </main>
    {selectedPerson&&view==='tree'&&!wide&&<Modal open onOpenChange={v=>!v&&setSelected('')} title="Member profile" subtitle={selectedPerson.givenName} drawer><div className="mobile-profile-wrap">{openProfile(selectedPerson)}</div></Modal>}
    <PersonEditor target={editor} onClose={()=>setEditor(null)} onSaved={onSaved}/><RelationshipEditor fromId={relationship} onClose={()=>setRelationship(null)}/><MemoryDialog target={memory} onClose={()=>setMemory(null)}/>
    <Confirm open={!!deletePerson} title={`Remove ${deletePerson?.givenName || 'this member'}?`} message="Their profile and relationships will be removed. Memories will stay in the archive, with this person removed from the people attached to them." label="Remove member" danger onCancel={()=>setDeletePerson(null)} onConfirm={async()=>{if(deletePerson){const id=deletePerson.id;await commit(a=>{a.people=a.people.filter(p=>p.id!==id);a.relationships=a.relationships.filter(r=>r.from!==id&&r.to!==id);a.memories=a.memories.map(m=>({...m,personIds:m.personIds.filter(x=>x!==id)}));if(a.rootPersonId===id)a.rootPersonId=a.people[0]?.id||'';return a},`Removed ${deletePerson.givenName}`);setSelected('');setDeletePerson(null)}}}/>
    <Modal open={startOpen} onOpenChange={setStartOpen} title="Start your family archive" subtitle="This replaces the sample records with a new, empty family archive."><div className="modal-body"><label>Family archive title<input data-modal-focus value={newTitle} maxLength={200} onChange={e=>setNewTitle(e.target.value)}/></label><p>The sample records are saved as a recovery snapshot before they are replaced.</p><p>Next, you can add the first person in your family.</p>{startError&&<div className="field-error">{startError}</div>}</div><div className="modal-footer"><Button onClick={()=>setStartOpen(false)}>Cancel</Button><Button variant="primary" onClick={()=>void newFamily()} disabled={startBusy}>{startBusy&&<LoaderCircle size={15} className="spin"/>}Start my family</Button></div></Modal>
    {mobileNav&&<Modal open onOpenChange={setMobileNav} title="Roots" subtitle="Family Archive" drawer><nav className="mobile-nav">{nav.map(item=>{const Icon=item.icon;return <button key={item.id} onClick={()=>{setView(item.id);setMobileNav(false)}}><Icon size={18}/>{item.label}</button>})}<button onClick={()=>{setStartOpen(true);setMobileNav(false)}}><Heart size={18}/>Start my family</button></nav></Modal>}
  </div>
}
export default function AppRoot(){return <ErrorBoundary><App/></ErrorBoundary>}
