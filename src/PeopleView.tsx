import { useMemo, useState } from 'react';
import { ArrowDownAZ, ArrowUpRight, Filter, Plus, SearchX, Users } from 'lucide-react';
import { useArchive } from './storage';
import { displayName, formatFamilyDate, type Person } from './model';
import { Avatar, Button, Empty } from './ui';

export function PeopleView({ query, onSelect, onAdd }: { query: string; onSelect: (id: string) => void; onAdd: () => void }) {
  const { archive } = useArchive();
  const [filter, setFilter] = useState('all'), [sort, setSort] = useState('name');
  const people = useMemo(() => archive.people.filter(p => {
    const q = query.toLocaleLowerCase();
    const match = !q || [p.givenName,p.surname,p.nativeName,p.knownAs,p.gothram,p.ancestralVillage,p.currentPlace].join(' ').toLocaleLowerCase().includes(q);
    return match && (filter === 'all' || (filter === 'needs-checking' ? p.confidence === 'unsure' : p.livingStatus === filter));
  }).sort((a,b) => sort === 'birth' ? (Number(a.birth.value.slice(0,4)) || 9999) - (Number(b.birth.value.slice(0,4)) || 9999) : displayName(a,archive.settings.nameOrder).localeCompare(displayName(b,archive.settings.nameOrder))), [archive.people, archive.settings.nameOrder,query,filter,sort]);
  return <div className="people-view"><div className="view-controls"><div className="filter-control"><Filter size={16}/><select aria-label="Filter members" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All family members</option><option value="living">Living</option><option value="deceased">Remembered</option><option value="unknown">Status unknown</option><option value="needs-checking">Needs checking</option></select></div><span className="subtle">{people.length} members</span><label className="filter-control sort-control"><ArrowDownAZ size={16}/><select aria-label="Sort members" value={sort} onChange={e => setSort(e.target.value)}><option value="name">Name</option><option value="birth">Birth year</option></select></label></div>
    {people.length ? <div className="table-scroll"><table className="people-table"><thead><tr><th>Name</th><th>Life</th><th>Gothram</th><th>Ancestral place</th><th>Source</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{people.map(p => <tr key={p.id}><td><button className="table-person" onClick={() => onSelect(p.id)}><Avatar person={p}/><span><strong>{displayName(p,archive.settings.nameOrder)}</strong><small>{p.nativeName || p.knownAs || p.occupation}</small></span></button></td><td><span>{formatFamilyDate(p.birth, archive.settings.dateFormat) || 'Birth not recorded'}</span><small className="table-sub">{p.livingStatus === 'living' ? 'Living' : p.livingStatus === 'deceased' ? formatFamilyDate(p.death, archive.settings.dateFormat) || 'Deceased' : 'Status not recorded'}</small></td><td>{p.gothram || <span className="not-recorded">—</span>}</td><td>{p.ancestralVillage || <span className="not-recorded">—</span>}</td><td><span className={`confidence ${p.confidence}`}>{p.confidence === 'confirmed' ? 'Confirmed' : p.confidence === 'recalled' ? 'Recollection' : 'Needs checking'}</span></td><td><button className="icon-button" aria-label={`View ${displayName(p)}`} onClick={() => onSelect(p.id)}><ArrowUpRight size={17}/></button></td></tr>)}</tbody></table></div> : <Empty icon={<SearchX size={30}/>} title={archive.people.length ? 'No matching family members' : 'Your family belongs here'} action={!archive.people.length && <Button variant="primary" onClick={onAdd}><Plus size={16}/>Add first member</Button>}/>}
  </div>;
}
