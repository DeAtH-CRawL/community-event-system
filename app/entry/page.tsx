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

  // Guest Input State
  const [guests, setGuests] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem('station_id') || '';
    setStationId(saved);
  }, []);

  const updateStationId = (val: string) => {
    setStationId(val);
    localStorage.setItem('station_id', val);
  };

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
        guests: guests, // Pass guests
        stationId: stationId,
      });

      if (!result.success) {
        window.alert(result.message || 'Check-in failed.');
      } else {
        const total = selectedFamily.family_size + guests;
        window.alert(`✓ Checked In! ${total} plates entitled (${selectedFamily.family_size} + ${guests} guests).`);
        setSearch('');
        setResults([]);
        setGuests(0);
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

        {/* Search Bar */}
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
              placeholder="Search by Name or Phone"
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
                onClick={() => {
                  if (!isCheckedIn) {
                    setSelectedFamily(family);
                    setGuests(0); // Reset guests
                  }
                }}
                disabled={isCheckedIn}
                className={`w-full text-left rounded-2xl border border-slate-200 dark:border-slate-800 p-6 transition-all active:scale-[0.98] group ${isCheckedIn
                  ? 'bg-slate-50 dark:bg-slate-900/50 opacity-60 cursor-not-allowed grayscale'
                  : 'bg-white dark:bg-slate-900 hover:border-emerald-500 dark:hover:border-emerald-500/50'
                  }`}
              >
                <div className="flex justify-between items-center mb-1.5">
                  <div className="flex items-center gap-3">
                    <h2 className={`text-xl font-bold transition-colors ${isCheckedIn ? 'text-slate-400' : 'text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400'}`}>
                      {family.surname}
                    </h2>
                    {isCheckedIn && (
                      <span className="bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border border-amber-200 dark:border-amber-500/20">
                        In
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Size: {family.family_size}
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

          {search.length >= 2 && results.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <p className="text-xl font-bold text-slate-500">No family found</p>
            </div>
          )}
        </section>
      </div>

      {/* Check-in Modal */}
      {selectedFamily && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl p-8">
            <div className="text-center space-y-6">

              {/* Family Header */}
              <div>
                <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-4">
                  Confirm Check-In
                </p>
                <h2 className="text-3xl font-bold text-white mb-2">
                  {selectedFamily.surname}
                </h2>
                <div className="bg-slate-900 rounded-lg p-3 inline-block border border-slate-800">
                  <span className="text-slate-400 text-xs font-bold uppercase tracking-wider mr-2">Registered Size</span>
                  <span className="text-xl font-bold text-white">{selectedFamily.family_size}</span>
                </div>
              </div>

              {/* Guest Input */}
              <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-800">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">
                  Additional Guests
                </label>
                <div className="flex items-center justify-center gap-6">
                  <button
                    onClick={() => setGuests(Math.max(0, guests - 1))}
                    className="w-14 h-14 flex items-center justify-center rounded-xl bg-slate-800 text-slate-300 font-bold text-2xl hover:bg-slate-700 active:scale-95 transition-all"
                  >
                    -
                  </button>
                  <div className="w-16 text-center">
                    <span className="text-4xl font-black text-white">{guests}</span>
                  </div>
                  <button
                    onClick={() => setGuests(guests + 1)}
                    className="w-14 h-14 flex items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 font-bold text-2xl hover:bg-emerald-500/30 active:scale-95 transition-all border border-emerald-500/30"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Summary */}
              <div className="text-center">
                <p className="text-sm text-slate-400">
                  Total Entitlement: <span className="text-emerald-400 font-bold text-lg">{selectedFamily.family_size + guests} Plates</span>
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleCheckIn}
                  disabled={isSaving}
                  className="w-full rounded-xl bg-emerald-500 text-white font-bold py-4 text-lg transition-all shadow-lg shadow-emerald-500/10 active:scale-95 disabled:opacity-50 hover:bg-emerald-400"
                >
                  {isSaving ? 'Checking In...' : 'Confirm & Check In'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFamily(null)}
                  className="w-full rounded-xl bg-transparent border border-slate-800 text-slate-400 font-bold py-3 text-sm hover:bg-slate-900 transition-all"
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
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </main>
  );
}
