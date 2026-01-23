'use client';

import { useEffect, useState } from 'react';
import { checkInFamily, searchFamilies, type Family } from '@/src/lib/actions';

const DEFAULT_EVENT = "Community Dinner 2024";

export default function EntryGatePage() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Family[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState<Family | null>(null);
  const [stationId, setStationId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Load stationId from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('station_id') || '';
    setStationId(saved);
  }, []);

  const updateStationId = (val: string) => {
    setStationId(val);
    localStorage.setItem('station_id', val);
  };

  // Search with debounce
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    const handle = setTimeout(async () => {
      if (search.length < 2) {
        setResults([]);
        setIsLoading(false);
        return;
      }
      try {
        const data = await searchFamilies(search, DEFAULT_EVENT);
        if (!cancelled) {
          setResults(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('searchFamilies failed', err);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [search]);

  const handleCheckIn = async () => {
    if (!selectedFamily) return;

    setIsSaving(true);
    try {
      const result = await checkInFamily({
        role: 'volunteer',
        eventName: DEFAULT_EVENT,
        familyId: selectedFamily.id,
        stationId: stationId,
      });

      if (!result.success) {
        window.alert(result.message || 'Check-in failed.');
      } else {
        window.alert(`✓ ${selectedFamily.surname} checked in! ${selectedFamily.plates_entitled} plates entitled.`);
        setSearch('');
        setResults([]);
      }
      setSelectedFamily(null);
    } catch (err) {
      console.error(err);
      window.alert('Check-in failed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col">
      <div className="w-full max-w-xl mx-auto px-4 py-6 flex-1 flex flex-col">
        {/* Header */}
        <header className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-emerald-400">
              Entry Gate
            </h1>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">
              {DEFAULT_EVENT}
            </p>
          </div>
          <div className="flex flex-col items-end">
            <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">STATION ID</label>
            <input
              type="text"
              value={stationId}
              onChange={(e) => updateStationId(e.target.value)}
              placeholder="e.g. Gate 1"
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1 text-[10px] font-black uppercase text-emerald-400 focus:border-emerald-500 outline-none w-24 text-center"
            />
          </div>
        </header>

        {/* Search Bar - FIXED: Clear placeholder text */}
        <div className="mb-8">
          <div className="relative group">
            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
              <svg className="w-5 h-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Family Name or Phone Number"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-14 pr-6 py-4 text-xl font-bold placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
              autoFocus
            />
          </div>
        </div>

        {/* Results */}
        <section className="flex-1 overflow-y-auto pb-6 space-y-4">
          {isLoading && search.length > 0 && (
            <p className="text-center font-bold text-slate-500 animate-pulse">Searching…</p>
          )}

          {results.map((family) => {
            const isCheckedIn = !!family.checked_in_at;
            return (
              <button
                key={family.id}
                type="button"
                onClick={() => !isCheckedIn && setSelectedFamily(family)}
                disabled={isCheckedIn}
                className={`w-full text-left rounded-2xl border border-slate-200 dark:border-slate-800 p-6 transition-all active:scale-[0.98] group ${isCheckedIn
                  ? 'bg-slate-50 dark:bg-slate-900/50 opacity-60 cursor-not-allowed grayscale'
                  : 'bg-white dark:bg-slate-900 hover:border-emerald-500 dark:hover:border-emerald-500/50'
                  }`}
              >
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center gap-3">
                    {/* FIXED: Show surname instead of family_name */}
                    <h2 className={`text-xl font-bold transition-colors ${isCheckedIn ? 'text-slate-400' : 'text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400'}`}>
                      {family.surname}
                    </h2>
                    {isCheckedIn && (
                      <span className="bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border border-amber-200 dark:border-amber-500/20">
                        ALREADY CHECKED IN
                      </span>
                    )}
                  </div>
                  {/* FIXED: Show family_size and plates_remaining clearly */}
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Members: {family.family_size}
                    </span>
                    <span className={`text-sm font-bold ${family.plates_remaining > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {family.plates_remaining} plates left
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-baseline">
                  <p className="text-base text-slate-500 dark:text-slate-400 font-medium">
                    {family.head_name}
                  </p>
                  <p className="text-xs text-slate-400 font-mono">
                    {family.phone}
                  </p>
                </div>
              </button>
            );
          })}

          {/* No Results Message */}
          {search.length >= 2 && results.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <p className="text-xl font-bold text-slate-500">No family found</p>
              <p className="text-slate-600 mt-2 max-w-xs mx-auto">
                No match for "<span className="font-bold text-slate-400">{search}</span>" in the data source.
              </p>
              <p className="text-slate-700 text-sm mt-4">
                Try searching by a different name or phone number.
              </p>
            </div>
          )}

          {search.length < 2 && search.length > 0 && (
            <p className="text-center text-slate-500 font-medium">
              Type at least 2 characters to search
            </p>
          )}
        </section>
      </div>

      {/* Check-in Confirmation Modal */}
      {selectedFamily && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center space-y-6">
              <div>
                <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-4">
                  Confirm Check-In
                </p>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                  {selectedFamily.surname}
                </h2>
                <p className="text-lg text-slate-500 dark:text-slate-400 font-medium mb-1">
                  {selectedFamily.head_name}
                </p>
                <p className="text-xs text-slate-400 font-mono tracking-tight">
                  {selectedFamily.phone}
                </p>
              </div>

              {/* Key info display */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700/50">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Members</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{selectedFamily.family_size}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Plates Entitled</p>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{selectedFamily.plates_entitled}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleCheckIn}
                  disabled={isSaving}
                  className="w-full rounded-xl bg-emerald-500 text-white font-bold py-4 text-lg transition-all shadow-lg shadow-emerald-500/10 active:scale-95 disabled:opacity-50"
                >
                  {isSaving ? 'Checking in...' : `✓ Check In (${selectedFamily.plates_entitled} plates)`}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFamily(null)}
                  className="w-full rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold py-4 text-sm transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isSaving && (
        <div className="fixed inset-0 z-[100] bg-white/60 dark:bg-slate-950/60 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300">
          <div className="w-12 h-12 border-4 border-slate-200 dark:border-slate-800 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400 text-xs font-bold tracking-widest uppercase">Processing...</p>
        </div>
      )}
    </main>
  );
}
