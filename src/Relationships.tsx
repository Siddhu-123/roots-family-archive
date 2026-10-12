import { useEffect, useState } from 'react';
import { Check, Link2, Trash2 } from 'lucide-react';
import { useArchive } from './storage';
import { displayName, relationshipError, relationshipSchema, unknownDate, uid, type Relationship } from './model';
import { Button, Modal, DateField, ErrorMessage, Confirm, errorText } from './ui';

export function RelationshipEditor({ fromId, onClose }: { fromId: string | null; onClose: () => void }) {
  const { archive, commit } = useArchive();
  const [draft, setDraft] = useState<Relationship | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [removing, setRemoving] = useState<string | null>(null);
  const person = archive.people.find(p => p.id === fromId);
  useEffect(() => { if (fromId) { setDraft({ id: uid(), from: fromId, to: '', type: 'parent', parentKind: 'unknown', status: 'partner', date: unknownDate(), place: '', notes: '' }); setError(''); } }, [fromId]);
  const patch = (data: Partial<Relationship>) => setDraft(d => d ? { ...d, ...data } : d);
  const save = async () => {
    if (!draft) return; setBusy(true); setError('');
    try {
      const parsed = relationshipSchema.safeParse(draft);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      await commit(a => { const err = relationshipError(a, draft, a.relationships.some(r => r.id === draft.id) ? draft.id : ''); if (err) throw new Error(err); a.relationships = [...a.relationships.filter(r => r.id !== draft.id), draft]; return a; }, 'Updated relationship');
      onClose();
    } catch(e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const existing = archive.relationships.filter(r => r.from === fromId || r.to === fromId);
  return <>
    <Modal open={!!fromId} onOpenChange={v => !v && !busy && onClose()} title="Family relationships" subtitle={person ? displayName(person) : undefined}>
      <div className="modal-body">
        <ErrorMessage message={error}/>
        {draft && <>
          <div className="form-grid"><label>First member<select value={draft.from} onChange={e => patch({from:e.target.value})}>{archive.people.map(p => <option key={p.id} value={p.id}>{displayName(p,archive.settings.nameOrder)}</option>)}</select></label><label>Relationship<select value={draft.type} onChange={e => patch({type:e.target.value as Relationship['type']})}><option value="parent">is a parent of</option><option value="partner">is a spouse / partner of</option><option value="sibling">is a sibling of</option></select></label></div>
          <label>Second member<select data-modal-focus value={draft.to} onChange={e => patch({to:e.target.value})}><option value="">Choose a family member</option>{archive.people.filter(p => p.id !== draft.from).map(p => <option key={p.id} value={p.id}>{displayName(p,archive.settings.nameOrder)}</option>)}</select></label>
          {draft.type === 'parent' && <label>Parent relationship<select value={draft.parentKind} onChange={e => patch({parentKind:e.target.value as Relationship['parentKind']})}><option value="unknown">Not recorded</option><option value="biological">Biological</option><option value="adoptive">Adoptive</option><option value="step">Step-parent</option><option value="guardian">Guardian</option></select></label>}
          {draft.type === 'partner' && <><label>Relationship status<select value={draft.status} onChange={e => patch({status:e.target.value as Relationship['status']})}><option value="partner">Not recorded / partner</option><option value="married">Married</option><option value="separated">Separated</option><option value="divorced">Divorced</option><option value="widowed">Widowed</option></select></label><DateField label="Marriage / union" value={draft.date} onChange={date => patch({date})}/><label>Place<input value={draft.place} onChange={e => patch({place:e.target.value})}/></label></>}
          <label>Relationship notes<textarea rows={2} value={draft.notes} onChange={e => patch({notes:e.target.value})}/></label>
        </>}
        {existing.length > 0 && <div className="existing-links"><h3>Recorded relationships</h3>{existing.map(r => <div className="existing-link" key={r.id}><button onClick={() => { setDraft(structuredClone(r)); setError(''); }}><Link2 size={16}/><span>{displayName(archive.people.find(p => p.id === r.from)!)} <small>{r.type === 'parent' ? 'parent of' : r.type === 'partner' ? 'partner of' : 'sibling of'}</small> {displayName(archive.people.find(p => p.id === r.to)!)}</span></button><Button variant="ghost" aria-label="Remove relationship" title="Remove relationship" onClick={() => setRemoving(r.id)}><Trash2 size={15}/></Button></div>)}</div>}
      </div><div className="modal-footer"><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" onClick={save} disabled={busy}><Check size={16}/>Save relationship</Button></div>
    </Modal>
    <Confirm open={!!removing} title="Remove this relationship?" message="Both family members and their stories will be kept." label="Remove relationship" danger onCancel={() => setRemoving(null)} onConfirm={async () => { await commit(a => { a.relationships = a.relationships.filter(r => r.id !== removing); return a; }, 'Removed relationship'); setRemoving(null); if (draft?.id === removing) setDraft({ ...draft, id: uid(), to: '' }); }}/>
  </>;
}
