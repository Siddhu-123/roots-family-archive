import { useEffect, useState } from 'react';
import { useArchive } from './storage';
import { Button, ErrorMessage, errorText } from './ui';

export function Settings() {
  const { archive, commit } = useArchive();
  const [error,setError] = useState(''),[title,setTitle]=useState(archive.title);
  useEffect(()=>setTitle(archive.title),[archive.title]);
  const update = async (patch: Partial<typeof archive.settings>) => {
    setError('');
    try { await commit(a => { a.settings = { ...a.settings, ...patch }; return a; }, 'Updated archive settings'); }
    catch (e) { setError(errorText(e)); }
  };
  const rename = async () => {
    setError('');
    try { await commit(a => { a.title = title.trim() || 'My family'; return a; }, 'Renamed family archive'); }
    catch (e) { setError(errorText(e)); }
  };
  return <section className="settings-view"><ErrorMessage message={error}/><div className="settings-group"><h2>Family archive</h2><label>Archive title<input value={title} maxLength={200} onChange={e => setTitle(e.target.value)}/></label><p className="subtle">Stored on this device in your browser.</p><Button variant="primary" onClick={() => void rename()}>Save archive title</Button></div><div className="settings-group"><h2>Display</h2><label>Name order<select value={archive.settings.nameOrder} onChange={e => void update({nameOrder:e.target.value as typeof archive.settings.nameOrder})}><option value="given-first">Given name first</option><option value="surname-first">Surname first</option></select></label><label>Date format<select value={archive.settings.dateFormat} onChange={e => void update({dateFormat:e.target.value as typeof archive.settings.dateFormat})}><option value="dmy">Day, month, year</option><option value="iso">YYYY-MM-DD</option></select></label><label>Text size<select value={archive.settings.textSize} onChange={e => void update({textSize:e.target.value as typeof archive.settings.textSize})}><option value="normal">Standard</option><option value="large">Larger</option></select></label></div><div className="settings-group"><h2>Privacy</h2><p>Your family archive stays in this browser. There are no accounts or cloud sync.</p></div></section>;
}
