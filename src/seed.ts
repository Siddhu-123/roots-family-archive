import { newArchive, newPerson, unknownDate, yearDate, uid, type Archive, type Person, type Relationship } from './model';

export function sampleArchive(): Archive {
  const a = newArchive('The Rao family'); a.demo = true;
  const make = (id: string, name: string, birth: number, gender: Person['gender'], extra: Partial<Person> = {}) => ({
    ...newPerson(name), id, surname: 'Rao', birth: yearDate(birth), gender, livingStatus: 'living' as const, confidence: 'recalled' as const, ...extra,
  });
  a.people = [
    make('venkat', 'Venkata', 1908, 'male', { livingStatus: 'deceased', death: yearDate(1989), birth: yearDate(1908, true), occupation: 'Farmer', ancestralVillage: 'Tenali, Andhra Pradesh', gothram: 'Bharadwaja' }),
    make('lakshmi', 'Lakshmi', 1915, 'female', { livingStatus: 'deceased', death: yearDate(1998), maidenName: 'Kolluru', nativeName: 'లక్ష్మి', knownAs: 'Pedda ammamma', notes: 'Remembered for keeping the whole family together at every festival.' }),
    make('krishna', 'Krishna', 1936, 'male', { livingStatus: 'deceased', death: yearDate(2012), occupation: 'School teacher', gothram: 'Bharadwaja', birthPlace: 'Tenali, Andhra Pradesh' }),
    make('savitri', 'Savitri', 1942, 'female', { birth: yearDate(1942, true), nativeName: 'సావిత్రి', knownAs: 'Ammamma', maidenName: 'Nalluri', gothram: 'Kashyapa', ancestralVillage: 'Bapatla, Andhra Pradesh', currentPlace: 'Hyderabad', occupation: 'Homemaker', languages: 'Telugu, Hindi', source: 'Family recollection', notes: 'The keeper of our family stories. Remembers the old house, harvest celebrations, and everyone who came before us.' }),
    make('rama', 'Rama', 1939, 'female', { surname: 'Devi', maidenName: 'Rao', currentPlace: 'Vijayawada', knownAs: 'Rama atta' }),
    make('suresh', 'Suresh', 1965, 'male', { occupation: 'Engineer', currentPlace: 'Hyderabad', gothram: 'Bharadwaja' }),
    make('padma', 'Padma', 1968, 'female', { maidenName: 'Reddy', occupation: 'Teacher', currentPlace: 'Hyderabad', nativeName: 'పద్మ' }),
    make('latha', 'Latha', 1970, 'female', { surname: 'Varma', maidenName: 'Rao', occupation: 'Doctor', currentPlace: 'Bengaluru' }),
    make('arun', 'Arun', 1967, 'male', { surname: 'Varma', occupation: 'Architect', currentPlace: 'Bengaluru' }),
    make('ananya', 'Ananya', 1995, 'female', { currentPlace: 'Hyderabad', occupation: 'Designer', knownAs: 'Anu' }),
    make('aditya', 'Aditya', 1998, 'male', { currentPlace: 'Pune', occupation: 'Software engineer' }),
    make('meera', 'Meera', 2001, 'female', { surname: 'Varma', currentPlace: 'Bengaluru', occupation: 'Student' }),
  ];
  a.rootPersonId = 'savitri';
  const rel = (from: string, to: string, type: Relationship['type']): Relationship => ({ id: uid(), from, to, type,
    parentKind: 'biological', status: 'married', date: unknownDate(), place: '', notes: '' });
  for (const [x,y] of [['venkat','lakshmi'],['krishna','savitri'],['suresh','padma'],['latha','arun']]) a.relationships.push(rel(x,y,'partner'));
  for (const [parents, children] of [ [['venkat','lakshmi'],['krishna','rama']], [['krishna','savitri'],['suresh','latha']], [['suresh','padma'],['ananya','aditya']], [['latha','arun'],['meera']] ])
    for (const parent of parents) for (const child of children) a.relationships.push(rel(parent,child,'parent'));
  const now = new Date().toISOString();
  a.memories = [
    { id: uid(), title: 'Ugadi at the old house', content: 'Ammamma remembers the whole family gathering in the courtyard. The children helped tie mango leaves above the door, while Lakshmi prepared the Ugadi pachadi. Everyone ate together, sitting in a long row.', category: 'tradition', personIds: ['savitri','lakshmi'], date: yearDate(1955, true), place: 'Tenali, Andhra Pradesh', storyteller: 'Savitri Rao', source: 'Sample family story', attachmentIds: [], createdAt: now, updatedAt: now },
    { id: uid(), title: 'A teacher in every village', content: 'Krishna cycled to the village school each morning. Former students still visited years after he retired, often bringing their own children to meet him.', category: 'story', personIds: ['krishna'], date: yearDate(1960, true), place: 'Guntur district', storyteller: 'Savitri Rao', source: 'Sample family story', attachmentIds: [], createdAt: now, updatedAt: now },
    { id: uid(), title: 'Ammamma’s mango pickle', content: 'Raw mangoes, mustard powder, chilli powder, salt, and sesame oil. The family always made it together at the start of summer. Ask Ammamma about her measurements and the stories behind the recipe.', category: 'recipe', personIds: ['savitri'], date: unknownDate(), place: 'Hyderabad', storyteller: 'Savitri Rao', source: 'Sample family story', attachmentIds: [], createdAt: now, updatedAt: now },
  ];
  return a;
}
