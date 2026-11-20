import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { PRONUNCIATION_GLOSSARY } from '../data/scriptData';
import type { PronunciationCategory } from '../data/scriptData';

type FilterTab = 'all' | PronunciationCategory;

export const PronunciationReference: React.FC = () => {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<FilterTab>('all');

  const filtered = PRONUNCIATION_GLOSSARY.filter((entry) => {
    if (categoryFilter !== 'all' && entry.category !== categoryFilter) {
      return false;
    }
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      entry.arabic.includes(query.trim()) ||
      entry.phonetic.toLowerCase().includes(q) ||
      entry.origin.toLowerCase().includes(q) ||
      entry.tip.toLowerCase().includes(q)
    );
  });

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="p-6 border-b border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Tunisian Derja & French Loanword Pronunciation Guide
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Coastal Tunis Qaf is preserved on words like فوق, تفيق, تقوم, قعدة while الڨنّارية uses a hard G, paired with Tunisian vowel fixes and natural French loanword spellings.
            </p>
          </div>
          <div className="relative w-full sm:w-64 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter terms..."
              aria-label="Filter pronunciation terms"
              className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50/50 focus:bg-white focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/15"
            />
          </div>
        </div>

        {/* Category segmented filter */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
          {(
            [
              { id: 'all', label: `All Terms (${PRONUNCIATION_GLOSSARY.length})` },
              {
                id: 'tunisian',
                label: `Tunisian Phonetics (${PRONUNCIATION_GLOSSARY.filter((e) => e.category === 'tunisian').length})`,
              },
              {
                id: 'french',
                label: `French Loanwords (${PRONUNCIATION_GLOSSARY.filter((e) => e.category === 'french').length})`,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategoryFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                categoryFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/60 text-xs font-medium text-slate-500">
              <th className="py-3 px-6">Script Arabic</th>
              <th className="py-3 px-4">Tunisian Phonetic</th>
              <th className="py-3 px-4">Rule / Origin</th>
              <th className="py-3 px-6">Delivery Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filtered.map((item) => (
              <tr key={item.arabic} className="hover:bg-slate-50/60 transition-colors">
                <td
                  dir="rtl"
                  lang="ar-TN"
                  className="py-3.5 px-6 font-arabic text-base font-medium text-slate-900 text-right whitespace-nowrap"
                >
                  {item.arabic}
                </td>
                <td className="py-3.5 px-4 font-mono text-xs text-teal-800 whitespace-nowrap">
                  {item.phonetic}
                </td>
                <td className="py-3.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                  {item.origin}
                </td>
                <td className="py-3.5 px-6 text-xs text-slate-600 leading-relaxed">
                  {item.tip}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 px-6 text-center text-xs text-slate-500">
                  No terms match “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
