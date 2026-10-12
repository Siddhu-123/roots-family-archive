import { useEffect, useState } from 'react';
import { Download, Upload, History, RotateCcw, LoaderCircle, Network } from 'lucide-react';
import { useArchive, db, type Snapshot } from './storage';
import { makeBackup, readBackup, download, safeFilename } from './backup';
import { archiveFromGedcom, archiveToGedcom } from './interop';
import type { Archive, Attachment } from './model';
import { Button, Confirm, ErrorMessage, errorText } from './ui';

type Preview = { archive: Archive; files: Attachment[]; format: 'ZIP backup' | 'family JSON' | 'GEDCOM'; warnings: string[] };
export function BackupsView() {
  const { archive, commit } = useArchive();
  const [snapshots,setSnapshots] = useState<Snapshot[]>([]), [error,setError] = useState(''), [busy,setBusy] = useState(false), [preview,setPreview] = useState<Preview|null>(null), [restore,setRestore] = useState<Snapshot|null>(null), [confirmImport,setConfirmImport] = useState(false), [importing,setImporting] = useState(false);
  const refresh = async () => setSnapshots(await db.snapshots.orderBy('id').reverse().toArray());
  useEffect(() => { void refresh(); }, [archive.updatedAt]);
  const exportZip = async () => { setBusy(true); setError(''); try { download(await makeBackup(archive), `${safeFilename(archive.title)}-backup.zip`); } catch(e) { setError(errorText(e)); } finally { setBusy(false); } };
  const exportGedcom = () => {
    try {
      const data = archiveToGedcom(archive);
      download(new Blob([data], { type: 'text/plain;charset=utf-8' }), `${safeFilename(archive.title)}-genealogy.ged`);
    } catch(e) { setError(errorText(e)); }
  };
  const snapshot = async () => { setBusy(true); setError(''); try { await commit(a => a, 'Manual recovery snapshot'); await refresh(); } catch(e) { setError(errorText(e)); } finally { setBusy(false); } };
  const choose = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError('');
    try {
      if (/\.ged$/i.test(file.name)) {
        const result = archiveFromGedcom(await file.arrayBuffer(), file.name.replace(/\.ged$/i, ''));
        setPreview({ archive: result.archive, files: [], format: 'GEDCOM', warnings: result.warnings });
      } else {
        const result = await readBackup(file);
        setPreview({ ...result, format: /\.json$/i.test(file.name) ? 'family JSON' : 'ZIP backup', warnings: [] });
      }
    } catch(e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  const apply = async (data: Preview) => {
    setBusy(true); setError('');
    try {
      await commit(() => data.archive, `Imported ${data.archive.title}`, data.files);
      setPreview(null); setConfirmImport(false); setImporting(false); await refresh();
    } catch(e) { setError(errorText(e)); throw e; }
    finally { setBusy(false); }
  };
  const confirmMessage = preview?.format === 'GEDCOM'
    ? 'GEDCOM imports genealogy records only. Photos and other media are not included. Your current archive will be saved as a recovery snapshot before replacement.'
    : preview?.format === 'ZIP backup'
      ? 'This complete ZIP backup will replace the current archive, including its records and attached media. Your current archive will be saved as a recovery snapshot first.'
      : 'This JSON contains family records only. It does not include media. Your current archive will be saved as a recovery snapshot first.';
  return <div className="backups-view"><ErrorMessage message={error}/><section className="backup-actions"><div><h2>Keep a copy of your family archive</h2><p>Export a complete ZIP backup with your records and attachments, or save a recovery snapshot in this browser.</p></div><div className="backup-buttons"><Button onClick={() => void snapshot()} disabled={busy}><History size={16}/>Save snapshot</Button><Button variant="primary" onClick={() => void exportZip()} disabled={busy}>{busy ? <LoaderCircle size={16} className="spin"/> : <Download size={16}/>}Export complete ZIP</Button><Button onClick={exportGedcom}><Network size={16}/>Export GEDCOM records</Button><Button onClick={() => setImporting(v=>!v)}><Upload size={16}/>Import records or backup</Button></div></section>
    {importing && <section className="backup-import"><h3>Choose a file to import</h3><p>ZIP is the complete backup format and includes attached media. GEDCOM imports genealogy records only; it does not include photos or other media. We’ll validate the file and show a preview before replacement.</p><label className="button secondary file-label">Choose ZIP, JSON, or GEDCOM<input type="file" accept=".zip,.json,.ged,application/zip,application/json,text/plain" onChange={e => { void choose(e.target.files?.[0]); e.target.value=''; }}/></label></section>}
    {preview && <section className="backup-preview"><h3>{preview.format} import preview</h3><p><strong>{preview.archive.title}</strong> · {preview.archive.people.length} members · {preview.archive.relationships.length} relationships · {preview.archive.memories.length} memories · {preview.files.length} attachments</p>{preview.format !== 'ZIP backup' && <p className="subtle">This import has no media. Use a complete ZIP backup to restore photos, documents, and recordings.</p>}{preview.warnings.length > 0 && <div role="status"><strong>Import notes</strong><ul>{preview.warnings.slice(0, 8).map((warning, i) => <li key={i}>{warning}</li>)}</ul>{preview.warnings.length > 8 && <p>{preview.warnings.length - 8} more notes</p>}</div>}<div className="backup-buttons"><Button onClick={() => setPreview(null)}>Cancel</Button><Button variant="primary" onClick={() => setConfirmImport(true)} disabled={busy}>Review replacement</Button></div></section>}
    <section className="snapshot-section"><div className="section-label"><h2>Local recovery snapshots</h2><span className="subtle">Up to 30 recent saves</span></div>{snapshots.length ? <div className="snapshot-list">{snapshots.map(s => <article className="snapshot-row" key={s.id}><History size={17}/><div><strong>{s.label}</strong><small>{new Date(s.savedAt).toLocaleString()} · {s.archive.people.length} members · {s.archive.memories.length} memories</small></div><Button onClick={() => setRestore(s)}><RotateCcw size={15}/>Restore</Button></article>)}</div> : <p className="subtle">Snapshots are created automatically when you save changes.</p>}</section>
    <Confirm open={!!preview && confirmImport} title="Replace this archive?" message={confirmMessage} label="Replace archive" danger onCancel={() => setConfirmImport(false)} onConfirm={async () => { if (preview) await apply(preview); }}/>
    <Confirm open={!!restore} title="Restore this snapshot?" message="Your current archive will be saved as a recovery snapshot first. The selected snapshot will then replace it." label="Restore snapshot" danger onCancel={() => setRestore(null)} onConfirm={async () => { if (restore) { await commit(() => restore.archive, `Restored snapshot: ${restore.label}`); setRestore(null); await refresh(); } }}/>
  </div>;
}
