import { useEffect, useRef, useState } from 'react';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Camera, Check, Plus, Trash2, LoaderCircle } from 'lucide-react';
import { personSchema, newPerson, uid, displayName, unknownDate, relationshipError, type Person, type Relationship, type Attachment } from './model';
import { useArchive, attachmentFromFile, useAttachment } from './storage';
import { Button, IconButton, Modal, Confirm, DateField, ErrorMessage, Avatar, errorText } from './ui';

export type PersonEditorTarget = { person?: Person; anchorId?: string; relation?: 'parent' | 'child' | 'partner' | 'sibling'; source?: string };
export function PersonEditor({ target, onClose, onSaved }: { target: PersonEditorTarget | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { archive, commit } = useArchive();
  const [tab, setTab] = useState('essentials'), [error, setError] = useState(''), [discard, setDiscard] = useState(false), [photo, setPhoto] = useState<Attachment | null>(null), [localPhoto, setLocalPhoto] = useState('');
  const openedUpdatedAt = useRef('');
  const { register, control, handleSubmit, reset, watch, setValue, formState: { errors, isDirty, isSubmitting } } = useForm<Person>({ resolver: zodResolver(personSchema), defaultValues: newPerson() });
  const { fields, append, remove } = useFieldArray({ control, name: 'customFacts' });
  const formPerson = watch(), livingStatus = watch('livingStatus');
  const [relation, setRelation] = useState<PersonEditorTarget['relation']>('child');
  const [parentKind, setParentKind] = useState<Relationship['parentKind']>('unknown');
  const anchor = archive.people.find(p => p.id === target?.anchorId);
  useEffect(() => {
    if (!target) return;
    const p = target.person ? structuredClone(target.person) : newPerson();
    openedUpdatedAt.current = target.person?.updatedAt || '';
    if (target.source && !p.source) p.source = target.source;
    reset(p); setTab('essentials'); setError(''); setPhoto(null); setDiscard(false); setRelation(target.relation || 'child'); setParentKind('unknown');
  }, [target, reset]);
  useEffect(() => {
    if (!photo) { setLocalPhoto(''); return; }
    const url = URL.createObjectURL(photo.blob); setLocalPhoto(url); return () => URL.revokeObjectURL(url);
  }, [photo]);
  const close = () => { if (isSubmitting) return; if (isDirty || photo) setDiscard(true); else onClose(); };
  const save = async (data: Person) => {
    setError('');
    try {
      const now = new Date().toISOString();
      const saved = { ...data, updatedAt: now, photoId: photo?.id || data.photoId };
      await commit(a => {
        if (target?.person) {
          const current = a.people.find(p => p.id === target.person!.id);
          if (!current) throw new Error('This person was removed in another tab. Your draft is still open.');
          if (current.updatedAt !== openedUpdatedAt.current) throw new Error('This person changed in another tab. Reload the latest archive before saving. Your draft is still open.');
        }
        a.people = a.people.some(p => p.id === saved.id) ? a.people.map(p => p.id === saved.id ? saved : p) : [...a.people, saved];
        if (!a.rootPersonId) a.rootPersonId = saved.id;
        if (anchor && !target?.person) {
          const r: Relationship = { id: uid(), from: relation === 'parent' ? saved.id : anchor.id, to: relation === 'parent' ? anchor.id : saved.id,
            type: relation === 'partner' ? 'partner' : relation === 'sibling' ? 'sibling' : 'parent', parentKind, status: 'partner', date: unknownDate(), place: '', notes: '' };
          const err = relationshipError(a, r); if (err) throw new Error(err); a.relationships.push(r);
        }
        return a;
      }, target?.person ? `Edited ${displayName(saved)}` : `Added ${displayName(saved)}`, photo ? [photo] : []);
      onSaved(saved.id); onClose();
    } catch (e) { setError(errorText(e)); }
  };
  const tabError = Object.keys(errors).length > 0;
  return <>
    <Modal open={!!target} onOpenChange={open => !open && close()} title={target?.person ? 'Edit family member' : anchor ? `Add a relative of ${anchor.givenName}` : 'Add family member'} subtitle={target?.person ? displayName(target.person) : undefined} drawer>
      <form onSubmit={handleSubmit(save, invalid => { setError('Check the highlighted fields before saving.'); setTab(invalid.email || invalid.customFacts || invalid.occupation || invalid.currentPlace || invalid.phone ? 'more' : 'essentials'); requestAnimationFrame(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus()); })} className="editor-form" noValidate>
        <div className="editor-tabs" role="tablist" aria-label="Person details">{[['essentials','Essentials'],['heritage','Heritage'],['story','Life & sources'],['more','More details']].map(([key,label]) => <button key={key} role="tab" type="button" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>
        <div className="modal-body editor-body">
          <ErrorMessage message={error}/>
          {tabError && !error && <ErrorMessage message="Check the highlighted fields."/>}
          {tab === 'essentials' && <>
            <div className="photo-editor">{localPhoto ? <span className="avatar avatar-large"><img src={localPhoto} alt="Selected portrait"/></span> : <Avatar person={formPerson} size="large"/>}<div><label className="button secondary file-label"><Camera size={16}/>Add portrait<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => { const file = e.target.files?.[0]; if (file) { try { setPhoto(attachmentFromFile(file, uid())); } catch (e) { setError(errorText(e)); } } e.target.value = ''; }}/></label>{(formPerson.photoId || photo) && <Button variant="ghost" onClick={() => { setPhoto(null); setValue('photoId', '', { shouldDirty: true }); }}>Remove</Button>}</div></div>
            <div className="form-grid"><label>Given name / name <span className="required">*</span><input data-modal-focus autoComplete="off" {...register('givenName')} aria-invalid={!!errors.givenName}/>{errors.givenName && <span className="field-error">{errors.givenName.message}</span>}</label><label>Surname / family name<input autoComplete="off" {...register('surname')}/></label></div>
            <label>Name in native script<input {...register('nativeName')} placeholder="తెలుగు, हिन्दी, தமிழ்…" lang="und"/></label>
            <label>Known as / pet name<input {...register('knownAs')} placeholder="Ammamma, Dadi, or a family nickname"/></label>
            <div className="form-grid"><label>Gender<select {...register('gender')}><option value="unspecified">Not recorded</option><option value="female">Female</option><option value="male">Male</option><option value="nonbinary">Non-binary / other</option></select></label><label>Life status<select {...register('livingStatus')} onChange={e => { setValue('livingStatus', e.target.value as Person['livingStatus'], { shouldDirty: true }); if (e.target.value === 'living') setValue('death', unknownDate(), { shouldDirty: true }); }}><option value="unknown">Not sure</option><option value="living">Living</option><option value="deceased">Deceased</option></select></label></div>
            <Controller name="birth" control={control} render={({ field }) => <DateField label="Birth" value={field.value} onChange={field.onChange} error={errors.birth?.value?.message || errors.birth?.end?.message}/>}/>
            {livingStatus !== 'living' && <Controller name="death" control={control} render={({ field }) => <DateField label="Death" value={field.value} onChange={field.onChange} error={errors.death?.value?.message || errors.death?.end?.message}/>}/>}
            {anchor && !target?.person && <fieldset className="relationship-field"><legend>Relationship to {anchor.givenName}</legend><div className="form-grid"><label>This person is their<select value={relation} onChange={e => setRelation(e.target.value as PersonEditorTarget['relation'])}><option value="parent">Parent</option><option value="child">Child</option><option value="partner">Spouse / partner</option><option value="sibling">Sibling</option></select></label>{relation !== 'partner' && relation !== 'sibling' && <label>Parent relationship<select value={parentKind} onChange={e => setParentKind(e.target.value as Relationship['parentKind'])}><option value="unknown">Not recorded yet</option><option value="biological">Biological</option><option value="adoptive">Adoptive</option><option value="step">Step-parent</option><option value="guardian">Guardian</option></select></label>}</div></fieldset>}
          </>}
          {tab === 'heritage' && <>
            <label>Gothram / gotra<input {...register('gothram')} placeholder="As remembered by your family"/></label>
            <label>Birth / maiden surname<input {...register('maidenName')}/></label>
            <label>Ancestral village / place<input {...register('ancestralVillage')}/></label>
            <label>Birthplace<input {...register('birthPlace')}/></label>
            <label>Languages spoken<input {...register('languages')} placeholder="Telugu, Hindi, English…"/></label>
          </>}
          {tab === 'story' && <>
            <label>Life story / things to remember<textarea {...register('notes')} rows={8} placeholder="Their childhood, character, achievements, and family stories"/></label>
            <label>Information shared by / source<input {...register('source')} placeholder="Grandmother’s name, document, or family record"/></label>
            <label>How certain is this information?<select {...register('confidence')}><option value="recalled">Family recollection</option><option value="confirmed">Confirmed with a record</option><option value="unsure">Needs checking</option></select></label>
          </>}
          {tab === 'more' && <>
            <label>Occupation / calling<input {...register('occupation')}/></label><label>Current / last place of residence<input {...register('currentPlace')}/></label>
            <div className="form-grid"><label>Phone<input {...register('phone')} type="tel"/></label><label>Email<input {...register('email')} type="email" aria-invalid={!!errors.email}/>{errors.email && <span className="field-error">{errors.email.message}</span>}</label></div>
            <div className="section-label"><h3>Other family details</h3><IconButton label="Add a custom detail" onClick={() => append({ id: uid(), label: '', value: '' })}><Plus size={18}/></IconButton></div>
            {fields.map((field, i) => <div className="custom-field-row" key={field.id}><label>Detail<input {...register(`customFacts.${i}.label`)} aria-invalid={!!errors.customFacts?.[i]?.label} placeholder="Family deity, festival, title…"/>{errors.customFacts?.[i]?.label && <span className="field-error">Enter a label.</span>}</label><label>Value<input {...register(`customFacts.${i}.value`)}/></label><IconButton label="Remove detail" onClick={() => remove(i)}><Trash2 size={16}/></IconButton></div>)}
          </>}
        </div>
        <div className="modal-footer"><Button onClick={close} disabled={isSubmitting}>Cancel</Button><Button variant="primary" type="submit" disabled={isSubmitting}>{isSubmitting ? <LoaderCircle size={16} className="spin"/> : <Check size={16}/>}Save member</Button></div>
      </form>
    </Modal>
    <Confirm open={discard} title="Discard unsaved details?" message="Your changes to this form have not been saved." label="Discard changes" danger onCancel={() => setDiscard(false)} onConfirm={() => { setDiscard(false); onClose(); }}/>
  </>;
}
