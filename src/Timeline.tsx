import { useMemo } from 'react';
import { CalendarDays, BookOpen } from 'lucide-react';
import { useArchive } from './storage';
import { displayName, formatFamilyDate, type FamilyDate } from './model';
import { Empty } from './ui';

export function Timeline({ onPerson, onMemory }: { onPerson: (id: string) => void; onMemory: (id: string) => void }) {
  const { archive } = useArchive();
  type Row = { id: string; year: number; date: FamilyDate; title: string; person?: string; memory?: string };
  const rows = useMemo<Row[]>(() => [
    ...archive.people.flatMap(p => [
      p.birth.kind !== 'unknown' ? { id: `${p.id}-birth`, year: Number(p.birth.value.slice(0,4)) || 9999, date: p.birth, title: `${displayName(p,archive.settings.nameOrder)} was born`, person: p.id } : null,
      p.death.kind !== 'unknown' ? { id: `${p.id}-death`, year: Number(p.death.value.slice(0,4)) || 9999, date: p.death, title: `${displayName(p,archive.settings.nameOrder)} died`, person: p.id } : null,
    ].filter((x): x is NonNullable<typeof x> => !!x)),
    ...archive.memories.filter(m => m.date.kind !== 'unknown').map(m => ({ id:m.id, year:Number(m.date.value.slice(0,4)) || 9999, date:m.date, title:m.title, memory:m.id })),
  ].sort((a,b) => a.year-b.year), [archive]);
  if (!rows.length) return <Empty icon={<CalendarDays size={30}/>} title="Your family timeline will grow here">Add dates to member profiles and memories to place them in time.</Empty>;
  return <div className="timeline-list">{rows.map(row => <article className="timeline-row" key={row.id}><div className="timeline-year">{formatFamilyDate(row.date,archive.settings.dateFormat)}</div><span className="timeline-dot"/><button onClick={() => row.memory ? onMemory(row.memory) : row.person && onPerson(row.person)}>{row.memory && <BookOpen size={16}/>}<span>{row.title}</span></button></article>)}</div>;
}
