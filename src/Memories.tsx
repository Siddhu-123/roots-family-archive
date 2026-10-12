import { useEffect, useRef, useState } from 'react';
import { BookOpen, Utensils, Flower2, Image, FileText, Mic, Square, Plus, Paperclip, Trash2, Pencil, Check, Play, Download, LoaderCircle, ArrowUpRight } from 'lucide-react';
import { useArchive, useAttachment, attachmentFromFile } from './storage';
import { displayName, formatFamilyDate, dateSchema, memorySchema, unknownDate, uid, type Memory, type Attachment } from './model';
import { Modal, Button, IconButton, DateField, Avatar, Empty, ErrorMessage, Confirm, errorText } from './ui';

export const categoryIcons = { story: BookOpen, photo: Image, document: FileText, tradition: Flower2, recipe: Utensils, interview: Mic };
export const categoryLabels = { story: 'Family story', photo: 'Photograph', document: 'Document', tradition: 'Tradition', recipe: 'Family recipe', interview: 'Conversation' };
export function AttachmentView({ id }: { id: string }) {
  const { file, url } = useAttachment(id);
  if (!file) return <div className="attachment-loading">Loading attachment…</div>;
  return <div className="attachment-view">
    {file.type.startsWith('image/') && <img className="memory-photo" src={url} alt={file.name}/>}
    {file.type.startsWith('audio/') && <audio controls src={url} preload="metadata" aria-label={file.name}/>}
    {file.type.startsWith('video/') && <video controls src={url} preload="metadata" aria-label={file.name}/>}
    <a className="attachment-download" href={url} download={file.name}><Paperclip size={14}/><span>{file.name}</span><Download size={14}/></a>
  </div>;
}
export function MemoriesView({ query, onOpen, onAdd }: { query: string; onOpen: (m: Memory) => void; onAdd: () => void }) {
  const { archive } = useArchive(); const [filter, setFilter] = useState('all');
  const memories = archive.memories.filter(m => (filter === 'all' || m.category === filter) && (!query || [m.title,m.content,m.storyteller,m.place,...m.personIds.map(id => displayName(archive.people.find(p => p.id === id)!))].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()))).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  return <div className="memories-view"><div className="memory-filters">{[['all','All memories'],...Object.entries(categoryLabels)].map(([id,label]) => <button key={id} className={filter === id ? 'active' : ''} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div>
    {memories.length ? <div className="memory-grid">{memories.map(m => { const Icon = categoryIcons[m.category]; return <button className="memory-card" key={m.id} onClick={() => onOpen(m)}><div className="memory-card-top"><span className={`memory-category ${m.category}`}><Icon size={16}/>{categoryLabels[m.category]}</span><ArrowUpRight size={17}/></div><h3>{m.title}</h3><p>{m.content || m.place || 'A piece of your family’s history.'}</p><div className="memory-card-bottom"><div className="avatar-stack">{m.personIds.slice(0,3).map(id => { const p = archive.people.find(p => p.id === id); return p ? <Avatar key={id} person={p} size="small"/> : null; })}</div><span>{m.storyteller || formatFamilyDate(m.date, archive.settings.dateFormat) || 'Family archive'}</span>{m.attachmentIds.length > 0 && <Paperclip size={14}/>}</div></button>; })}</div> : <Empty icon={<BookOpen size={32}/>} title={query || filter !== 'all' ? 'No matching memories' : 'A family is more than names and dates'} action={<Button variant="primary" onClick={onAdd}><Plus size={16}/>Add a memory</Button>}/>}
  </div>;
}
export type MemoryTarget = { memory?: Memory; personIds?: string[] };
export function MemoryDialog({ target, onClose }: { target: MemoryTarget | null; onClose: () => void }) {
  const { archive, commit } = useArchive();
  const [draft, setDraft] = useState<Memory | null>(null), [editing,setEditing] = useState(false), [files,setFiles] = useState<Attachment[]>([]), [busy,setBusy] = useState(false), [error,setError] = useState(''), [dirty,setDirty] = useState(false), [discard,setDiscard] = useState(false), [deleting,setDeleting] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), [recording,setRecording] = useState(false), [seconds,setSeconds] = useState(0), recorderSession = useRef(0), openedUpdatedAt = useRef('');
  const stopTracks = (target = stream.current) => { target?.getTracks().forEach(t => t.stop()); if (stream.current === target) stream.current = null; };
  useEffect(() => {
    recorderSession.current++;
    if (target) {
      const now = new Date().toISOString();
      openedUpdatedAt.current = target.memory?.updatedAt || '';
      setDraft(target.memory ? structuredClone(target.memory) : { id: uid(), title: '', content: '', category: 'story', personIds: target.personIds || [], date: unknownDate(), place: '', storyteller: '', source: '', attachmentIds: [], createdAt: now, updatedAt: now });
      setEditing(!target.memory); setFiles([]); setError(''); setDirty(false); setDiscard(false); setSeconds(0); setRecording(false);
    }
    return () => {
      recorderSession.current++;
      const activeRecorder = recorder.current;
      if (activeRecorder?.state === 'recording') activeRecorder.stop();
      recorder.current = null;
      stopTracks();
    };
  }, [target]);
  useEffect(() => { if (!recording) return; const t = setInterval(() => setSeconds(s => s + 1), 1000); return () => clearInterval(t); }, [recording]);
  const patch = (data: Partial<Memory>) => { setDraft(d => d ? { ...d,...data } : d); setDirty(true); };
  const addFile = (file: File) => { try { const item = attachmentFromFile(file, uid()); setFiles(f => [...f,item]); setDirty(true); } catch(e) { setError(errorText(e)); } };
  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia || !('MediaRecorder' in window)) throw new Error('Audio recording is unavailable in this browser. You can attach a recording file instead.');
      const session = recorderSession.current;
      const recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (session !== recorderSession.current) { stopTracks(recordingStream); return; }
      stream.current = recordingStream;
      const type = ['audio/webm','audio/mp4','audio/ogg'].find(t => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(recordingStream, type ? { mimeType: type } : undefined), chunks: Blob[] = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stopTracks(recordingStream);
        if (session !== recorderSession.current) return;
        if (recorder.current === rec) recorder.current = null;
        setRecording(false);
        const blob = new Blob(chunks, { type: rec.mimeType }), ext = rec.mimeType.includes('mp4') ? 'm4a' : rec.mimeType.includes('ogg') ? 'ogg' : 'webm';
        addFile(new File([blob], `family-conversation-${Date.now()}.${ext}`, { type: rec.mimeType.split(';')[0] }));
      };
      rec.onerror = () => { stopTracks(recordingStream); if (session !== recorderSession.current) return; if (recorder.current === rec) recorder.current = null; setRecording(false); setError('The recording stopped unexpectedly. Try again or upload an audio file.'); };
      recorder.current = rec; rec.start(1000); setRecording(true); setSeconds(0); setError('');
    } catch(e) { stopTracks(); setError(errorText(e)); }
  };
  const save = async () => {
    if (!draft) return; setBusy(true); setError('');
    try {
      const data = { ...draft, attachmentIds: [...draft.attachmentIds,...files.map(f => f.id)], updatedAt: new Date().toISOString() };
      const parsed = memorySchema.safeParse(data); if (!parsed.success) throw new Error(parsed.error.issues[0].path.includes('title') ? 'Give this memory a title.' : parsed.error.issues[0].message);
      await commit(a => {
        if (target?.memory) {
          const current = a.memories.find(m => m.id === target.memory!.id);
          if (!current) throw new Error('This memory was removed in another tab. Your draft is still open.');
          if (current.updatedAt !== openedUpdatedAt.current) throw new Error('This memory changed in another tab. Reload the latest archive before saving. Your draft is still open.');
        }
        a.memories = [...a.memories.filter(m => m.id !== data.id), data]; return a;
      }, `Saved memory: ${data.title}`, files);
      onClose();
    } catch(e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const close = () => { if (busy) return; if (dirty || recording) setDiscard(true); else onClose(); };
  const Icon = draft ? categoryIcons[draft.category] : BookOpen;
  return <>
    <Modal open={!!target} onOpenChange={v => !v && close()} title={editing ? target?.memory ? 'Edit memory' : 'Add a memory' : draft?.title || 'Family memory'} subtitle={!editing && draft ? categoryLabels[draft.category] : undefined} wide>
      <div className="modal-body memory-dialog-body"><ErrorMessage message={error}/>{draft && (editing ? <>
        <label>Title <span className="required">*</span><input data-modal-focus value={draft.title} onChange={e => patch({title:e.target.value})} maxLength={300} placeholder="A story worth remembering"/></label>
        <div className="form-grid"><label>Kind of memory<select value={draft.category} onChange={e => patch({category:e.target.value as Memory['category']})}>{Object.entries(categoryLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Shared by / storyteller<input value={draft.storyteller} onChange={e => patch({storyteller:e.target.value})}/></label></div>
        <label>The story<textarea rows={7} value={draft.content} onChange={e => patch({content:e.target.value})} maxLength={10000}/></label>
        <div className="form-grid"><label>Place<input value={draft.place} onChange={e => patch({place:e.target.value})}/></label><label>Source / record<input value={draft.source} onChange={e => patch({source:e.target.value})}/></label></div>
        <DateField label="When it happened" value={draft.date} onChange={date => patch({date})}/>
        <fieldset className="tag-family"><legend>Family members in this memory</legend><div className="member-checkboxes">{archive.people.map(p => <label key={p.id}><input type="checkbox" checked={draft.personIds.includes(p.id)} onChange={e => patch({personIds:e.target.checked ? [...draft.personIds,p.id] : draft.personIds.filter(id => id !== p.id)})}/>{displayName(p,archive.settings.nameOrder)}</label>)}</div></fieldset>
        <div className="attachment-editor"><div className="section-label"><h3>Photos, documents & recordings</h3></div><div className="attachment-actions"><label className="button secondary file-label"><Paperclip size={16}/>Attach files<input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,audio/*,video/mp4,video/webm,text/plain" onChange={e => { for (const file of e.target.files || []) addFile(file); e.target.value = ''; }}/></label>{recording ? <Button variant="danger" onClick={() => recorder.current?.stop()}><Square size={15}/>Stop · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2,'0')}</Button> : <Button onClick={startRecording}><Mic size={16}/>Record voice</Button>}</div>{draft.attachmentIds.map(id => <div className="editable-attachment" key={id}><AttachmentView id={id}/><IconButton label="Remove attachment from memory" onClick={() => patch({attachmentIds:draft.attachmentIds.filter(a => a !== id)})}><Trash2 size={16}/></IconButton></div>)}{files.map(file => <div className="pending-file" key={file.id}><Paperclip size={16}/><span>{file.name}</span><small>{(file.size/1024/1024).toFixed(1)} MB</small><IconButton label={`Remove ${file.name}`} onClick={() => setFiles(f => f.filter(x => x.id !== file.id))}><Trash2 size={15}/></IconButton></div>)}</div>
      </> : <>
        <div className="memory-read-meta"><Icon size={19}/>{formatFamilyDate(draft.date, archive.settings.dateFormat) && <span>{formatFamilyDate(draft.date, archive.settings.dateFormat)}</span>}{draft.place && <span>{draft.place}</span>}</div>
        <p className="memory-full-story">{draft.content || 'No written story has been added.'}</p>
        <div className="memory-people">{draft.personIds.map(id => { const p = archive.people.find(p => p.id === id); return p ? <span key={id}><Avatar person={p} size="small"/>{displayName(p,archive.settings.nameOrder)}</span> : null; })}</div>
        {draft.storyteller && <div className="storyteller-note"><Mic size={17}/><span>Remembered by <strong>{draft.storyteller}</strong></span></div>}{draft.source && <p className="source-note"><FileText size={15}/>{draft.source}</p>}
        <div className="memory-media">{draft.attachmentIds.map(id => <AttachmentView key={id} id={id}/>)}</div>
      </>)}</div>
      <div className="modal-footer">{target?.memory && <IconButton label="Delete memory" onClick={() => setDeleting(true)}><Trash2 size={17}/></IconButton>}<span className="footer-spacer"/>{editing ? <><Button onClick={close} disabled={busy}>Cancel</Button><Button variant="primary" disabled={busy || recording} onClick={save}>{busy ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>}Save memory</Button></> : <><Button onClick={close}>Close</Button><Button data-modal-focus variant="primary" onClick={() => setEditing(true)}><Pencil size={16}/>Edit memory</Button></>}</div>
    </Modal>
    <Confirm open={discard} title="Discard this memory draft?" message="Your unsaved text and recordings will be discarded." danger label="Discard draft" onCancel={() => setDiscard(false)} onConfirm={() => { setDiscard(false); onClose(); }}/>
    <Confirm open={deleting} title="Delete this memory?" message="It will be removed from the family archive. A recent local recovery copy will remain available in Backups." danger label="Delete memory" onCancel={() => setDeleting(false)} onConfirm={async () => { await commit(a => { a.memories = a.memories.filter(m => m.id !== draft?.id); return a; }, 'Deleted memory'); setDeleting(false); onClose(); }}/>
  </>;
}
