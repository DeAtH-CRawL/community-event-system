'use client';

import { useEffect, useState, useCallback } from 'react';
import { checkInFamily, searchFamilies, getLastSync, type Family, getActiveEventName } from '@/src/lib/actions';
import { APP_CONFIG, UI_MESSAGES, ORGANIZATION_TITLE } from '@/src/lib/constants';

export default function EntryGatePage() {
  const [eventName, setEventName] = useState("Live Session");
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Family[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState<Family | null>(null);
  const [stationId, setStationId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // Minimal Toast State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Guest Input State
  const [guests, setGuests] = useState(0);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const syncActiveEvent = useCallback(async () => {
    const activeName = await getActiveEventName();
    setEventName(activeName);
    getLastSync(activeName).then(setLastSync);
  }, []);

  useEffect(() => {
    syncActiveEvent();

    const saved = localStorage.getItem('station_id') || '';
    setStationId(saved);
  }, [syncActiveEvent]);

  const updateStationId = (val: string) => {
    const cleaned = val.toUpperCase().slice(0, APP_CONFIG.STATION_ID_MAX_LENGTH);
    setStationId(cleaned);
    localStorage.setItem('station_id', cleaned);
  };

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    const handle = setTimeout(async () => {
      if (search.length < APP_CONFIG.SEARCH_MIN_CHARS) {
        setResults([]);
        setIsLoading(false);
        return;
      }
      try {
        // Always try to get latest event name before search to handle resets gracefully
        const activeName = await getActiveEventName();
        if (!cancelled) setEventName(activeName);

        const data = await searchFamilies(search, activeName);
        if (!cancelled) {
          setResults(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('searchFamilies failed', err);
        if (!cancelled) {
          setResults([]);
          showToast(UI_MESSAGES.SEARCH_ERROR, 'error');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, APP_CONFIG.DEBOUNCE_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [search, showToast]);

  const handleCheckIn = async () => {
    if (!selectedFamily) return;

    setIsSaving(true);
    try {
      const result = await checkInFamily({
        role: 'volunteer',
        eventName: eventName,
        familyId: selectedFamily.id,
        guests: guests,
        stationId: stationId,
      });

      if (!result.success) {
        showToast(result.error || UI_MESSAGES.CHECKIN_ERROR, 'error');
      } else {
        const total = selectedFamily.family_size + guests;
        showToast(`✓ Checked In! ${total} plates entitled.`, 'success');
        setSearch('');
        setResults([]);
        setGuests(0);
        setSelectedFamily(null);
      }
    } catch (err) {
      console.error(err);
      showToast(UI_MESSAGES.CHECKIN_ERROR, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const closeModal = () => {
    if (isSaving) return;
    setSelectedFamily(null);
    setGuests(0);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col relative overflow-x-hidden pt-0 sm:pt-0">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-6 py-4 rounded-2xl shadow-2xl font-black text-xs uppercase tracking-widest animate-in fade-in slide-in-from-top-4 duration-300 border border-white/10 backdrop-blur-md ${toast.type === 'success' ? 'bg-emerald-600/90 text-white' : 'bg-red-600/90 text-white'
          }`}>
          {toast.message}
        </div>
      )}

      <div className="w-full max-w-xl mx-auto px-4 py-8 flex-1 flex flex-col">
        {/* Header */}
        <header className="mb-10 flex justify-between items-start">
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1">
              {ORGANIZATION_TITLE}
            </p>
            <h1 className="text-4xl font-black tracking-tighter text-emerald-400">
              Entry Gate
            </h1>
            <div className="mt-2 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                  Live Session Active
                </p>
              </div>
              {lastSync && (
                <p className="text-slate-500 font-bold text-[10px] uppercase tracking-widest bg-slate-900 px-2 py-0.5 rounded border border-slate-800 w-fit">
                  Database Sync: {new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end">
            <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">STATION</label>
            <input
              type="text"
              value={stationId}
              onChange={(e) => updateStationId(e.target.value)}
              placeholder="GATE-1"
              className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm font-black uppercase text-emerald-400 focus:border-emerald-500 outline-none w-32 text-center shadow-lg shadow-black/50"
              maxLength={APP_CONFIG.STATION_ID_MAX_LENGTH}
            />
          </div>
        </header>

        {/* Search Bar */}
        <div className="mb-12">
          <div className="relative group">
            <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
              <svg className="w-7 h-7 text-slate-500 group-focus-within:text-emerald-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Family Name / Phone"
              className="w-full rounded-[1.5rem] border border-slate-800 bg-slate-900/60 pl-16 pr-8 py-6 text-2xl font-black placeholder:text-slate-600 focus:outline-none focus:ring-8 focus:ring-emerald-500/5 focus:border-emerald-500 transition-all shadow-2xl"
              autoFocus
              aria-label="Search families by surname or phone number"
            />
          </div>
        </div>

        {/* Results */}
        <section className="flex-1 overflow-y-auto pb-8 space-y-5">
          {isLoading && search.length >= APP_CONFIG.SEARCH_MIN_CHARS && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-8 h-8 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
              <p className="font-black text-slate-600 uppercase tracking-widest text-xs">Scanning Database…</p>
            </div>
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
                    setGuests(0);
                  } else {
                    showToast(UI_MESSAGES.ALREADY_CHECKED_IN, 'error');
                  }
                }}
                className={`w-full text-left rounded-[1.5rem] border-2 p-7 transition-all active:scale-[0.97] group relative overflow-hidden shadow-xl ${isCheckedIn
                  ? 'bg-slate-900/30 border-transparent opacity-40 grayscale cursor-default'
                  : 'bg-slate-900/80 border-slate-800/80 hover:border-emerald-500/40 hover:bg-slate-800'
                  }`}
                aria-label={`Check in ${family.surname} family`}
              >
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-4">
                    <h2 className={`text-3xl font-black transition-colors ${isCheckedIn ? 'text-slate-500' : 'text-white group-hover:text-emerald-400 tracking-tight'}`}>
                      {family.surname}
                    </h2>
                    {isCheckedIn && (
                      <span className="bg-amber-500/10 text-amber-500 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-[0.1em] border border-amber-500/20">
                        IN SYSTEM
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-black text-slate-500 uppercase tracking-widest block opacity-70">
                      FAM SIZE: {family.family_size}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-baseline">
                  <p className="text-xl text-slate-400 font-bold tracking-tight">
                    {family.head_name}
                  </p>
                  <p className="text-base text-slate-500 font-black tracking-widest font-mono">
                    {family.phone?.slice(-4) ? `****${family.phone.slice(-4)}` : 'N/A'}
                  </p>
                </div>
              </button>
            );
          })}

          {search.length >= APP_CONFIG.SEARCH_MIN_CHARS && results.length === 0 && !isLoading && (
            <div className="text-center py-20 bg-slate-900/20 rounded-[2.5rem] border-4 border-dashed border-slate-800/50">
              <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-800">
                <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <p className="text-2xl font-black text-slate-500 mb-2">{UI_MESSAGES.NOT_FOUND}</p>
              <p className="text-sm text-slate-600 font-bold px-8 leading-relaxed max-w-xs mx-auto">Try searching for just the SURNAME or the LAST 4 DIGITS of the phone number.</p>
            </div>
          )}
        </section>
      </div>

      {/* Check-in Modal */}
      {selectedFamily && (
        <div
          className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-slate-950/95 backdrop-blur-xl p-0 sm:p-4 animate-in fade-in duration-300"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-lg rounded-t-[3rem] sm:rounded-[3rem] bg-slate-900 border-t sm:border border-slate-800 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] p-10 relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center space-y-10">
              {/* Family Header */}
              <div>
                <p className="text-xs font-black text-emerald-500 uppercase tracking-[0.3em] mb-6">
                  Verify Check-In
                </p>
                <h2 className="text-5xl font-black text-white mb-4 tracking-tighter">
                  {selectedFamily.surname}
                </h2>
                <div className="bg-slate-950 rounded-2xl p-5 inline-flex items-center border border-slate-800 shadow-inner">
                  <span className="text-slate-500 text-xs font-black uppercase tracking-widest mr-4">Family Base Size</span>
                  <span className="text-3xl font-black text-emerald-400">{selectedFamily.family_size}</span>
                </div>
              </div>

              {/* Guest Input */}
              <div className="bg-slate-950/70 rounded-[2.5rem] p-10 border border-slate-800/80 shadow-2xl relative group">
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-8">
                  Extra Guests (Non-Registered)
                </label>
                <div className="flex items-center justify-center gap-10">
                  <button
                    onClick={() => setGuests(Math.max(0, guests - 1))}
                    className="w-20 h-20 flex items-center justify-center rounded-[1.5rem] bg-slate-800 text-slate-300 font-black text-4xl hover:bg-slate-700 active:scale-90 transition-all border border-slate-700 shadow-xl"
                    aria-label="Decrease guest count"
                  >
                    −
                  </button>
                  <div className="w-24 text-center">
                    <span className="text-7xl font-black text-white lining-nums transition-all group-active:scale-110">{guests}</span>
                  </div>
                  <button
                    onClick={() => setGuests(guests + 1)}
                    className="w-20 h-20 flex items-center justify-center rounded-[1.5rem] bg-emerald-500/10 text-emerald-400 font-black text-4xl hover:bg-emerald-500/20 active:scale-90 transition-all border border-emerald-500/20 shadow-2xl shadow-emerald-500/5"
                    aria-label="Increase guest count"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Summary */}
              <div className="text-center pb-4">
                <p className="text-slate-500 font-black uppercase tracking-widest text-sm mb-1">Total Entitlement</p>
                <p className="text-emerald-400 font-black text-4xl tracking-tight">
                  {selectedFamily.family_size + guests} PLATES
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-5 pt-2">
                <button
                  type="button"
                  onClick={handleCheckIn}
                  disabled={isSaving}
                  className="w-full rounded-[1.5rem] bg-emerald-500 text-white font-black py-6 text-2xl transition-all shadow-2xl shadow-emerald-500/20 active:scale-[0.98] disabled:opacity-50 hover:bg-emerald-400 flex items-center justify-center gap-4 border-b-4 border-emerald-700 active:border-b-0"
                >
                  {isSaving ? (
                    <>
                      <div className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
                      <span className="tracking-tighter">FINALIZING…</span>
                    </>
                  ) : (
                    'AUTHORIZE ENTRY'
                  )}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isSaving}
                  className="w-full rounded-[1.5rem] bg-transparent border-2 border-slate-800 text-slate-500 font-black py-4 text-sm hover:bg-slate-800 hover:text-slate-300 transition-all tracking-[0.2em]"
                >
                  DISMISS
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
