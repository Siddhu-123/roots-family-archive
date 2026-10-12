import { useEffect, useRef, useState } from 'react';
import { Mic, Check, ChevronRight, Plus, BookOpen, Heart, MapPin, Sprout, ArrowRight, ArrowUpRight } from 'lucide-react';
import { useArchive } from './storage';
import { displayName, uid, unknownDate, type Memory } from './model';
import { Button, Avatar, ErrorMessage, Empty, errorText } from './ui';

const topics = [
  { id: 'names', label: 'Names & family branches', icon: Sprout, questions: [
    ['The names we remember','What were your parents’ and grandparents’ full names? What did everyone call them at home?'],
    ['Surnames through the years','Which surnames did the women use before marriage? Were names written or pronounced differently?'],
    ['Our gothram','What gothram or gotra is remembered for each branch? Who would know if we are unsure?'],
    ['Brothers, sisters & cousins','Who were your brothers and sisters? Who were their partners and children?'],
  ] },
  { id: 'places', label: 'Homes & early life', icon: MapPin, questions: [
    ['The ancestral village','Which village did our family come from? What landmarks or nearby towns would help us find it?'],
    ['A childhood memory','What was your childhood home like? Who lived there with you?'],
    ['When things happened','Do you remember a birth or wedding year? Was it near a festival, harvest, or important event?'],
    ['A new home','Did the family move to another village, city, or country? Why did they move?'],
  ] },
  { id: 'stories', label: 'People & their stories', icon: Heart, questions: [
    ['A person worth remembering','Who do you wish the younger generation could have met? What made them special?'],
    ['Work & everyday life','What work did family members do? What was a normal day like for them?'],
    ['The wedding story','How did you meet? What do you remember about the wedding and who attended?'],
    ['A lesson to pass on','Which values, sayings, or life lessons would you like the children to remember?'],
  ] },
  { id: 'traditions', label: 'Traditions & keepsakes', icon: BookOpen, questions: [
    ['Festivals together','Which festivals, customs, family deity, or pilgrimages brought everyone together?'],
    ['A family recipe','Which dish reminds you of home? Who taught you to make it? Can we write down the recipe?'],
    ['The old photographs','Who is in this photo, where was it taken, and about when? What happened that day?'],
    ['Letters & family records','Are there old letters, diaries, wedding invitations, land records, or documents we should preserve?'],
  ] },
];
export function InterviewView({ onAddRelative, onOpenMemory }: { onAddRelative: (id: string, source: string) => void; onOpenMemory: (m: Memory) => void }) {
  const { archive, commit } = useArchive();
  const [personId, setPersonId] = useState(archive.rootPersonId), [storyteller, setStoryteller] = useState(''), [topicIndex,setTopicIndex] = useState(0), [questionIndex,setQuestionIndex] = useState(0), [answer,setAnswer] = useState(''), [hydratedKey,setHydratedKey] = useState(''), [error,setError] = useState(''), [busy,setBusy] = useState(false), [saved,setSaved] = useState(false);
  const migratedArchive = useRef('');
  const person = archive.people.find(p => p.id === personId), topic = topics[topicIndex], question = topic.questions[questionIndex];
  const storageKey = `roots-interview-draft-${archive.id}-${topic.id}-${questionIndex}-${personId || 'family'}`;
  const saveDraft = (key: string, value: string, speaker: string) => { try { sessionStorage.setItem(key, JSON.stringify({ answer: value, storyteller: speaker })); } catch {} };
  useEffect(() => {
    if (migratedArchive.current !== archive.id) {
      migratedArchive.current = archive.id;
      try {
        const old = sessionStorage.getItem(`roots-conversation-draft-${archive.id}`);
        if (old) {
          const data = JSON.parse(old), oldPerson = archive.people.some(p => p.id === data.personId) ? data.personId : personId;
          const oldTopic = Number.isInteger(data.topicIndex) && data.topicIndex >= 0 && data.topicIndex < topics.length ? data.topicIndex : 0;
          const oldQuestion = Number.isInteger(data.questionIndex) && data.questionIndex >= 0 && data.questionIndex < topics[oldTopic].questions.length ? data.questionIndex : 0;
          if (data.answers && typeof data.answers === 'object') for (const [key, value] of Object.entries(data.answers)) {
            const [ti, qi] = key.split(':').map(Number);
            if (typeof value === 'string' && Number.isInteger(ti) && Number.isInteger(qi) && topics[ti]?.questions[qi]) {
              const migratedKey = `roots-interview-draft-${archive.id}-${topics[ti].id}-${qi}-${oldPerson || 'family'}`;
              if (!sessionStorage.getItem(migratedKey)) saveDraft(migratedKey, value, typeof data.storyteller === 'string' ? data.storyteller : '');
            }
          }
          if (typeof data.answer === 'string' && data.answer && !data.answers?.[`${oldTopic}:${oldQuestion}`]) {
            const migratedKey = `roots-interview-draft-${archive.id}-${topics[oldTopic].id}-${oldQuestion}-${oldPerson || 'family'}`;
            if (!sessionStorage.getItem(migratedKey)) saveDraft(migratedKey, data.answer, typeof data.storyteller === 'string' ? data.storyteller : '');
          }
          if (oldPerson !== personId) setPersonId(oldPerson);
          if (topicIndex !== oldTopic) setTopicIndex(oldTopic);
          if (questionIndex !== oldQuestion) setQuestionIndex(oldQuestion);
          return;
        }
      } catch {}
    }
    try {
      const raw = sessionStorage.getItem(storageKey);
      const data = raw ? JSON.parse(raw) : null;
      setAnswer(data && typeof data.answer === 'string' ? data.answer : '');
      setStoryteller(data && typeof data.storyteller === 'string' ? data.storyteller : '');
    } catch { setAnswer(''); setStoryteller(''); }
    setHydratedKey(storageKey);
  }, [storageKey, archive.id, archive.people, personId, topicIndex, questionIndex]);
  useEffect(() => { if (hydratedKey === storageKey) saveDraft(storageKey, answer, storyteller); }, [answer, storyteller, hydratedKey, storageKey]);
  useEffect(() => { if (!archive.people.some(p => p.id === personId)) setPersonId(archive.rootPersonId); }, [archive.rootPersonId,archive.people,personId]);
  const conversations = archive.memories.filter(m => m.category === 'interview' && (!personId || m.personIds.includes(personId))).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  const switchQuestion = (ti: number, qi: number) => { saveDraft(storageKey, answer, storyteller); setTopicIndex(ti); setQuestionIndex(qi); setSaved(false); setError(''); };
  const save = async () => {
    if (!answer.trim()) { setError('Add a few notes from the conversation.'); return; }
    setBusy(true); setError('');
    try {
      const now = new Date().toISOString();
      const memory: Memory = { id: uid(), title: question[0], content: `${question[1]}\n\n${answer.trim()}`, category: 'interview', personIds: personId ? [personId] : [], date: unknownDate(), place: '', storyteller: storyteller.trim() || (person ? displayName(person,archive.settings.nameOrder) : ''), source: `Family conversation · ${new Date().toLocaleDateString('en-AU')}`, attachmentIds: [], createdAt: now, updatedAt: now };
      await commit(a => { a.memories.push(memory); return a; }, 'Saved family conversation');
      setAnswer(''); setSaved(true);
    } catch(e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return <div className="interview-view"><div className="conversation-setup"><label>Conversation about<select value={personId} onChange={e => { saveDraft(storageKey, answer, storyteller); setPersonId(e.target.value); }}><option value="">The whole family</option>{archive.people.map(p => <option key={p.id} value={p.id}>{displayName(p,archive.settings.nameOrder)}</option>)}</select></label><label>Speaking with<input value={storyteller} onChange={e => setStoryteller(e.target.value)} placeholder={person ? displayName(person,archive.settings.nameOrder) : 'Storyteller’s name'}/></label>{person && <Button onClick={() => onAddRelative(person.id,storyteller || displayName(person))}><Plus size={16}/>Add someone they mention</Button>}</div>
    <div className="conversation-layout"><nav className="conversation-topics" aria-label="Conversation topics">{topics.map((t,i) => { const Icon = t.icon; return <button key={t.id} className={topicIndex === i ? 'active' : ''} onClick={() => switchQuestion(i,0)}><Icon size={18}/><span>{t.label}</span><ChevronRight size={15}/></button>; })}<div className="conversation-person">{person && <><Avatar person={person}/><div><strong>{person.knownAs || person.givenName}</strong><span>{conversations.length} conversations preserved</span></div></>}</div></nav>
    <div className="conversation-writing"><div className="question-progress"><span>{topic.label}</span><span>Question {questionIndex + 1} of {topic.questions.length}</span></div><h2>{question[1]}</h2><div className="question-dots">{topic.questions.map((q,i) => <button key={i} aria-label={q[0]} title={q[0]} aria-current={questionIndex === i ? 'step' : undefined} className={questionIndex === i ? 'active' : ''} onClick={() => switchQuestion(topicIndex,i)}/>)}</div><label className="conversation-answer">Notes from the conversation<textarea value={answer} onChange={e => { setAnswer(e.target.value); setSaved(false); }} rows={9} maxLength={9500} placeholder="Their words, names, places, and things you want to remember…"/></label><ErrorMessage message={error}/><div className="conversation-footer"><span className="subtle">{saved ? <><Check size={15}/>Preserved in family memories</> : answer ? 'Draft kept in this tab' : ''}</span><Button onClick={() => switchQuestion(topicIndex,(questionIndex + 1) % topic.questions.length)}>Next question<ArrowRight size={16}/></Button><Button variant="primary" onClick={save} disabled={busy || !answer.trim()}><Check size={16}/>Save conversation</Button></div></div></div>
    {conversations.length > 0 && <section className="saved-conversations"><div className="section-label"><h3>Recent conversations</h3><span className="subtle">{conversations.length} preserved</span></div>{conversations.slice(0,6).map(m => <button className="conversation-row" key={m.id} onClick={() => onOpenMemory(m)}><Mic size={17}/><div><strong>{m.title}</strong><span>{m.storyteller} · {new Date(m.createdAt).toLocaleDateString('en-AU')}</span></div><ArrowUpRight size={16}/></button>)}</section>}
  </div>;
}
