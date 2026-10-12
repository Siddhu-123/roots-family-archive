import * as Dialog from '@radix-ui/react-dialog';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { X, ChevronDown, UserRound, AlertCircle, LoaderCircle } from 'lucide-react';
import { useEffect, useState, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { useAttachment } from './storage';
import { displayName, type Person, type FamilyDate } from './model';

export function Button({ children, variant = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button type="button" className={`button ${variant} ${className}`} {...props}>{children}</button>;
}
export function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" className={`icon-button ${className}`.trim()} title={label} aria-label={label} {...props}>{children}</button>;
}
export function Modal({ open, onOpenChange, title, subtitle, children, wide = false, drawer = false }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; subtitle?: string; children: ReactNode; wide?: boolean; drawer?: boolean }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal>
    <Dialog.Overlay className="modal-overlay"/>
    <Dialog.Content className={`modal ${wide ? 'wide' : ''} ${drawer ? 'drawer' : ''}`} onOpenAutoFocus={event => {
      event.preventDefault();
      const content = event.currentTarget as HTMLDivElement;
      requestAnimationFrame(() => ((content.querySelector('[data-modal-focus]') || content.querySelector('button, input, select, textarea, [tabindex="0"]')) as HTMLElement | null)?.focus());
    }}>
      <div className="modal-heading"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description className={subtitle ? '' : 'sr-only'}>{subtitle || title}</Dialog.Description></div><Dialog.Close asChild><IconButton label="Close"><X size={20}/></IconButton></Dialog.Close></div>
      {children}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
export function Confirm({ open, title, message, label = 'Confirm', danger = false, onCancel, onConfirm }: { open: boolean; title: string; message: string; label?: string; danger?: boolean; onCancel: () => void; onConfirm: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { if (open) setError(''); }, [open]);
  return <Modal open={open} onOpenChange={v => !v && !busy && onCancel()} title={title}><div className="modal-body"><p>{message}</p>{error && <ErrorMessage message={error}/>}</div><div className="modal-footer"><Button onClick={onCancel} disabled={busy}>Cancel</Button><Button data-modal-focus variant={danger ? 'danger' : 'primary'} disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }}>{busy && <LoaderCircle size={16} className="spin"/>}{label}</Button></div></Modal>;
}
export function Menu({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <Dropdown.Root><Dropdown.Trigger asChild><Button>{label}<ChevronDown size={14}/></Button></Dropdown.Trigger><Dropdown.Portal><Dropdown.Content className="dropdown-menu" align="end" sideOffset={7}>{children}</Dropdown.Content></Dropdown.Portal></Dropdown.Root>;
}
export function MenuItem({ children, onSelect, danger }: { children: ReactNode; onSelect: () => void; danger?: boolean }) {
  return <Dropdown.Item className={`dropdown-item ${danger ? 'danger-item' : ''}`} onSelect={onSelect}>{children}</Dropdown.Item>;
}
export function Avatar({ person, size = 'medium' }: { person: Person; size?: 'small' | 'medium' | 'large' }) {
  const { url } = useAttachment(person.photoId);
  const color = person.givenName.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 5;
  return <span className={`avatar avatar-${size} color-${color}`}>{url ? <img src={url} alt=""/> : <span aria-hidden="true">{person.givenName[0]}{person.surname[0] || ''}</span>}</span>;
}
export function PersonOption({ person }: { person: Person }) { return <span className="person-option"><Avatar person={person} size="small"/><span>{displayName(person)}</span></span>; }
export function ErrorMessage({ message }: { message?: string }) { return message ? <div className="error-message" role="alert"><AlertCircle size={16}/><span>{message}</span></div> : null; }
export function Empty({ icon = <UserRound size={32}/>, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
}
export function DateField({ label, value, onChange, error }: { label: string; value: FamilyDate; onChange: (date: FamilyDate) => void; error?: string }) {
  const changeKind = (kind: FamilyDate['kind']) => {
    let next = value.value;
    if (kind === 'unknown') next = '';
    else if (kind === 'date' && value.kind !== 'date') next = '';
    else if (kind !== 'date' && value.kind === 'date') next = next.slice(0, 4);
    else if (kind === 'date' && value.kind !== 'date') next = /^\d{4}$/.test(next) ? `${next}-01-01` : '';
    onChange({ ...value, kind, value: next, end: kind === 'range' ? value.end : '', approximate: kind === 'unknown' ? false : value.approximate });
  };
  return <fieldset className="date-field"><legend>{label}</legend><div className="date-row">
    <select aria-label={`${label} precision`} value={value.kind} onChange={e => changeKind(e.target.value as FamilyDate['kind'])}><option value="unknown">Unknown</option><option value="year">Year only</option><option value="date">Exact date</option><option value="range">Year range</option><option value="before">Before year</option><option value="after">After year</option></select>
    {value.kind !== 'unknown' && <input aria-label={label} type={value.kind === 'date' ? 'date' : 'text'} inputMode={value.kind === 'date' ? undefined : 'numeric'} placeholder="Year" maxLength={value.kind === 'date' ? undefined : 4} value={value.value} onChange={e => onChange({ ...value, value: e.target.value })}/>}
    {value.kind === 'range' && <><span className="date-separator">to</span><input aria-label={`${label} end year`} inputMode="numeric" maxLength={4} placeholder="Year" value={value.end} onChange={e => onChange({ ...value, end: e.target.value })}/></>}
  </div>{value.kind !== 'unknown' && <label className="checkbox-label"><input type="checkbox" checked={value.approximate} onChange={e => onChange({ ...value, approximate: e.target.checked })}/>Approximate / as remembered</label>}{error && <span className="field-error">{error}</span>}</fieldset>;
}
export function errorText(e: unknown) { return e instanceof Error ? e.message : 'Something went wrong. Please try again.'; }
export function useMedia(query: string) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => { const m = matchMedia(query), handler = () => setMatches(m.matches); m.addEventListener('change', handler); return () => m.removeEventListener('change', handler); }, [query]);
  return matches;
}
