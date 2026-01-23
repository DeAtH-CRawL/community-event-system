'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { getCheckedInFamilies, servePlates, type Family } from '@/src/lib/actions';

const DEFAULT_EVENT = "Community Dinner 2024";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function FoodCounterPage() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [isOnline, setIsOnline] = useState(true);
  const [stationId, setStationId] = useState('');

  useEffect(() => {
    setStationId(localStorage.getItem('station_id') || '');

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadFamilies = async () => {
    setIsLoading(true);
    try {
      const data = await getCheckedInFamilies(DEFAULT_EVENT);
      setFamilies(Array.isArray(data) ? data : []);
      setLastSync(new Date());
    } catch (err) {
      console.error('getCheckedInFamilies failed', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFamilies();

    // Real-time subscription
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'servings',
        },
        () => {
          loadFamilies();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Filter families based on search
  const filteredFamilies = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return families;
    return families.filter((f) =>
      f.surname.toLowerCase().includes(trimmed) ||
      f.head_name.toLowerCase().includes(trimmed) ||
      (f.phone && f.phone.includes(trimmed))
    );
  }, [families, search]);

  // Separate into active (has plates) and exhausted
  const activeFamilies = filteredFamilies.filter(f => f.plates_remaining > 0);
  const exhaustedFamilies = filteredFamilies.filter(f => f.plates_remaining === 0);

  const handleServe = async (familyId: string, quantity: number) => {
    if (quantity > 3) {
      if (!window.confirm(`Serve ${quantity} plates? Please confirm.`)) return;
    }

    setIsProcessing(familyId);
    try {
      const result = await servePlates({
        role: 'volunteer',
        eventName: DEFAULT_EVENT,
        familyId: familyId,
        quantity: quantity,
        stationId: stationId,
      });

      if (!result.success) {
        window.alert(result.message || 'Failed to serve plates.');
      }
      // Refresh data after serving
      await loadFamilies();
    } catch (err) {
      window.alert('Connection error. Please check internet.');
    } finally {
      setIsProcessing(null);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col">
      <div className="w-full max-w-xl mx-auto px-4 py-6 flex-1 flex flex-col">
        {/* Header */}
        <header className="mb-8 flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1.5">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Food Counter
              </h1>
              <div
                className={`w-2.5 h-2.5 rounded-full ring-4 ring-white dark:ring-slate-900 ${isOnline ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`}
                title={isOnline ? 'Online' : 'Offline'}
              />
            </div>
            <div className="flex items-center gap-2">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                {isLoading ? 'Syncing…' : `Last Sync: ${lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
              </p>
              {!isOnline && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-[9px] font-bold uppercase tracking-widest border border-red-100 dark:border-red-500/20">
                  Offline
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {stationId && (
              <div className="text-right px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">STATION</p>
                <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase leading-none">{stationId}</p>
              </div>
            )}
            <button
              onClick={loadFamilies}
              title="Manual Sync"
              className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-400 hover:text-slate-600 dark:hover:text-slate-100 transition-all active:scale-95 shadow-sm"
            >
              <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
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
              placeholder="Search by Family Name or Phone…"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-14 pr-6 py-4 text-xl font-bold placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
            />
          </div>
        </div>

        {/* Family Cards */}
        <section className="flex-1 overflow-y-auto pb-6 space-y-4">
          {/* Active families with plates remaining */}
          {activeFamilies.map((family) => {
            const isProcessingThis = isProcessing === family.id;
            const globalProcessing = isProcessing !== null;

            return (
              <div
                key={family.id}
                className={`w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 transition-all relative overflow-hidden ${isProcessingThis ? 'ring-2 ring-emerald-500 scale-[0.98]' : ''}`}
              >
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1 mr-4">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight mb-1">
                      {family.surname}
                    </h2>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                      {family.head_name}
                    </p>
                    {family.additional_guests > 0 && (
                      <p className="text-[10px] text-emerald-500 font-bold mt-1">
                        + {family.additional_guests} Guests
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                      Plates Left
                    </p>
                    <p className={`text-4xl font-bold font-mono tracking-tighter transition-colors ${family.plates_remaining <= 2 ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'
                      }`}>
                      {family.plates_remaining}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      of {family.plates_entitled}
                      <span className="block text-[8px] opacity-70">
                        ({family.family_size} + {family.additional_guests})
                      </span>
                    </p>
                  </div>
                </div>

                {/* Quick serve buttons */}
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleServe(family.id, num)}
                      disabled={family.plates_remaining < num || globalProcessing}
                      className={`rounded-xl py-4 text-lg font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 border ${family.plates_remaining >= num
                        ? 'bg-emerald-500 border-emerald-600 text-white'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-300 dark:text-slate-700 border-slate-100 dark:border-slate-800 cursor-not-allowed'
                        }`}
                    >
                      {isProcessingThis ? '…' : `+${num}`}
                    </button>
                  ))}
                </div>

                {isProcessingThis && (
                  <div className="absolute inset-0 bg-white/40 dark:bg-slate-900/40 backdrop-blur-[1px] flex flex-col items-center justify-center animate-in fade-in duration-200">
                    <div className="w-5 h-5 border-2 border-slate-200 dark:border-slate-800 border-t-emerald-500 rounded-full animate-spin mb-2"></div>
                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 tracking-widest uppercase">Recording...</p>
                  </div>
                )}
              </div>
            );
          })}

          {/* Exhausted families (plates_remaining = 0) */}
          {exhaustedFamilies.length > 0 && (
            <div className="mt-8">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
                Plates Exhausted ({exhaustedFamilies.length})
              </p>
              {exhaustedFamilies.map((family) => (
                <div
                  key={family.id}
                  className="w-full rounded-xl border border-slate-800 bg-slate-900/50 p-4 mb-2 opacity-60"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-400">{family.surname}</p>
                      <p className="text-[10px] text-slate-600">{family.head_name}</p>
                    </div>
                    <span className="text-xs font-bold text-red-500/70 uppercase">0 / {family.plates_entitled}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty states */}
          {filteredFamilies.length === 0 && (
            <div className="text-center py-20">
              {search ? (
                <>
                  <p className="text-xl font-black text-slate-500">No Match Found</p>
                  <p className="text-slate-700 font-bold mt-1">No checked-in family matches "{search}"</p>
                </>
              ) : (
                <>
                  <p className="text-xl font-black text-slate-500">No Families Checked In</p>
                  <p className="text-slate-700 font-bold mt-1">Waiting for check-ins from Entry Gate.</p>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
