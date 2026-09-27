// Deterministic pastel palette for dynamic master sections.
// Colours are assigned by section order/index only; users do not choose them
// and no colour value is stored in the database.
export const SECTION_PASTELS = [
  { border: 'border-emerald-200', surface: 'bg-emerald-50/55', soft: 'bg-emerald-50', nav: 'bg-emerald-50/35', title: 'text-emerald-800', accent: 'text-emerald-600' },
  { border: 'border-blue-200', surface: 'bg-blue-50/55', soft: 'bg-blue-50', nav: 'bg-blue-50/35', title: 'text-blue-800', accent: 'text-blue-600' },
  { border: 'border-violet-200', surface: 'bg-violet-50/55', soft: 'bg-violet-50', nav: 'bg-violet-50/35', title: 'text-violet-800', accent: 'text-violet-600' },
  { border: 'border-amber-200', surface: 'bg-amber-50/55', soft: 'bg-amber-50', nav: 'bg-amber-50/35', title: 'text-amber-800', accent: 'text-amber-600' },
  { border: 'border-rose-200', surface: 'bg-rose-50/55', soft: 'bg-rose-50', nav: 'bg-rose-50/35', title: 'text-rose-800', accent: 'text-rose-600' },
  { border: 'border-cyan-200', surface: 'bg-cyan-50/55', soft: 'bg-cyan-50', nav: 'bg-cyan-50/35', title: 'text-cyan-800', accent: 'text-cyan-600' },
  { border: 'border-orange-200', surface: 'bg-orange-50/55', soft: 'bg-orange-50', nav: 'bg-orange-50/35', title: 'text-orange-800', accent: 'text-orange-600' },
  { border: 'border-fuchsia-200', surface: 'bg-fuchsia-50/55', soft: 'bg-fuchsia-50', nav: 'bg-fuchsia-50/35', title: 'text-fuchsia-800', accent: 'text-fuchsia-600' },
];

export const getSectionPastel = (index = 0) => SECTION_PASTELS[Math.abs(Number(index) || 0) % SECTION_PASTELS.length];
