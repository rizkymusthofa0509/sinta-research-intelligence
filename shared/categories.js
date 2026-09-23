// SINTA's 10 official subject areas (the "Filter By Subject Area" list on
// sinta.kemdiktisaintek.go.id/journals). Garuda shows the same set as a
// journal's "Core Subject". `areas` lists Garuda's detailed subject areas
// that usually fall under each core subject; it is used only as a fallback
// when a journal has detailed areas but no core subject.

export const CATEGORIES = [
  {
    id: 'engineering',
    sintaAreaId: 10,
    label: 'Engineering',
    labelId: 'Teknik & Teknologi',
    areas: [
      'Computer Science & IT', 'Engineering', 'Electrical & Electronics Engineering',
      'Civil Engineering, Building, Construction & Architecture', 'Industrial & Manufacturing Engineering',
      'Control & Systems Engineering', 'Mechanical Engineering', 'Chemical Engineering, Chemistry & Bioengineering',
      'Materials Science & Nanotechnology', 'Energy', 'Transportation', 'Automotive Engineering', 'Aerospace Engineering',
    ],
  },
  {
    id: 'science',
    sintaAreaId: 5,
    label: 'Science',
    labelId: 'Sains (MIPA)',
    areas: [
      'Mathematics', 'Physics', 'Chemistry', 'Biochemistry, Genetics & Molecular Biology', 'Earth & Planetary Sciences',
      'Environmental Science', 'Astronomy', 'Neuroscience', 'Immunology & microbiology',
    ],
  },
  {
    id: 'health',
    sintaAreaId: 4,
    label: 'Health',
    labelId: 'Kesehatan',
    areas: ['Public Health', 'Health Professions', 'Medicine & Pharmacology', 'Nursing', 'Dentistry'],
  },
  {
    id: 'agriculture',
    sintaAreaId: 7,
    label: 'Agriculture',
    labelId: 'Pertanian',
    areas: ['Agriculture, Biological Sciences & Forestry', 'Veterinary'],
  },
  {
    id: 'economy',
    sintaAreaId: 2,
    label: 'Economy',
    labelId: 'Ekonomi & Bisnis',
    areas: ['Economics, Econometrics & Finance', 'Decision Sciences, Operations Research & Management'],
  },
  {
    id: 'education',
    sintaAreaId: 6,
    label: 'Education',
    labelId: 'Pendidikan',
    areas: ['Education'],
  },
  {
    id: 'social',
    sintaAreaId: 9,
    label: 'Social',
    labelId: 'Sosial & Hukum',
    areas: ['Social Sciences', 'Law, Crime, Criminology & Criminal Justice', 'Library & Information Science'],
  },
  {
    id: 'humanities',
    sintaAreaId: 3,
    label: 'Humanities',
    labelId: 'Humaniora & Bahasa',
    areas: ['Humanities', 'Languange, Linguistic, Communication & Media'],
  },
  {
    id: 'religion',
    sintaAreaId: 1,
    label: 'Religion',
    labelId: 'Agama',
    areas: ['Religion'],
  },
  {
    id: 'art',
    sintaAreaId: 8,
    label: 'Art',
    labelId: 'Seni & Desain',
    areas: ['Arts'],
  },
];

const byLabel = new Map(CATEGORIES.map((c) => [c.label.toLowerCase(), c]));
const byArea = new Map(CATEGORIES.flatMap((c) => c.areas.map((a) => [a.toLowerCase(), c])));
const byId = new Map(CATEGORIES.map((c) => [c.id, c]));

export const getCategory = (id) => byId.get(id) ?? null;

/** Map Garuda/SINTA subject strings to our category ids (deduplicated). */
export function categorize(coreSubjects = [], subjectAreas = []) {
  const ids = new Set();
  for (const s of coreSubjects) {
    const c = byLabel.get(String(s).trim().toLowerCase());
    if (c) ids.add(c.id);
  }
  if (ids.size === 0) {
    for (const a of subjectAreas) {
      const c = byArea.get(String(a).trim().toLowerCase());
      if (c) ids.add(c.id);
    }
  }
  return [...ids];
}
