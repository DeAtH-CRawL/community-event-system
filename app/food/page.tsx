'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { getCheckedInFamilies, servePlates, type Family, getActiveEventName } from '@/src/lib/actions';
import { APP_CONFIG, ORGANIZATION_TITLE } from '@/src/lib/constants';
import { Toast } from '@/src/components/Toast';

// Init client-side supabase for subscribe
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function FoodCounterPage() {
  const [eventName, setEventName] = useState("Live Session");
  const [families, setFamilies] = useState<Family[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date>(new Date());

  // Custom Serve Modal
  const [selectedFamily, setSelectedFamily] = useState<Family | null>(null);
  const [customQty, setCustomQty] = useState(1);
  const [stationId, setStationId] = useState('');

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    setStationId(localStorage.getItem('station_id') || '');
  }, []);

  const loadFamilies = useCallback(async () => {
    setIsLoading(true);
    try {
      // Always identify the single active event first
      const activeName = await getActiveEventName();
      setEventName(activeName);

      const data = await getCheckedInFamilies(activeName);
      setFamilies(Array.isArray(data) ? data : []);
      setLastSync(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFamilies();

    // REALTIME SUBSCRIPTION
    // Subscribe to ANY change in servings, then reload based on active name
    const channel = supabase.channel('food-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'servings'
        },
        () => {
          loadFamilies();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventName, loadFamilies]);

  const filteredFamilies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return families;
    return families.filter((f) =>
      f.surname.toLowerCase().includes(q) ||
      f.head_name.toLowerCase().includes(q) ||
      (f.phone && f.phone.includes(q))
    );
  }, [families, search]);

  const activeFamilies = filteredFamilies.filter(f => f.plates_remaining > 0);
  const exhaustedFamilies = filteredFamilies.filter(f => f.plates_remaining === 0);

  const handleServe = async () => {
    if (!selectedFamily) return;

    setIsProcessing(selectedFamily.family_id);
    try {
      const result = await servePlates({
        role: 'volunteer',
        eventName: eventName,
        familyId: selectedFamily.family_id,
        quantity: customQty,
        stationId: stationId
      });

      if (!result.success) {
        showToast(result.error || 'Serving failed.', 'error');
      } else {
        showToast(`✓ Served ${customQty} plates to ${selectedFamily.surname}.`, 'success');
        setSelectedFamily(null);
        setCustomQty(1);
      }
    } catch (err) {
      showToast('Failed to serve. Check internet.', 'error');
    } finally {
      setIsProcessing(null);
    }
  };

  const openServeModal = (f: Family) => {
    setSelectedFamily(f);
    setCustomQty(1);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col relative overflow-x-hidden">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="w-full max-w-xl mx-auto px-4 py-8 flex-1 flex flex-col">
        {/* Header */}
        <header className="mb-8 flex justify-between items-start">
          <div>
            <p className="text-[10px] uppercase text-slate-500 font-black tracking-[0.3em] mb-1">
              {ORGANIZATION_TITLE}
            </p>
            <h1 className="text-3xl font-black text-white tracking-tight">Food Counter</h1>
            <div className="mt-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <p className="text-slate-500 font-black uppercase tracking-widest text-[11px]">
                Session Live
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase text-slate-600 font-black tracking-widest mb-1">
              Sync: {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            {stationId && (
              <p className="text-[10px] text-emerald-500 font-black uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                {stationId}
              </p>
            )}
          </div>
        </header>

        {/* Search */}
        <div className="mb-10">
          <div className="relative group">
            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
              <svg className="w-6 h-6 text-slate-500 group-focus-within:text-emerald-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search Family..."
              className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl px-16 py-5 text-xl font-black outline-none focus:border-emerald-500 focus:ring-8 focus:ring-emerald-500/5 transition-all shadow-xl"
            />
          </div>
        </div>

        {/* List */}
        <div className="space-y-5 pb-10">
          {isLoading && families.length === 0 && (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-xs font-black text-slate-600 uppercase tracking-widest">Loading Records…</p>
            </div>
          )}

          {activeFamilies.map(f => (
            <div key={f.family_id} className="bg-slate-900 border-2 border-slate-800 rounded-[1.5rem] p-6 relative overflow-hidden shadow-xl hover:border-slate-700 transition-all">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-black text-white leading-tight tracking-tight">{f.surname}</h3>
                  <p className="text-lg text-slate-500 font-bold">{f.head_name}</p>
                  {f.guests > 0 && (
                    <span className="inline-block mt-2 text-[10px] font-black bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-lg uppercase tracking-[0.2em] border border-emerald-500/20 shadow-xl shadow-emerald-500/5">
                      + {f.guests} GUESTS
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase text-slate-600 font-black tracking-widest mb-1">REMAINING</p>
                  <p className="text-5xl font-black text-emerald-400 lining-nums tracking-tighter">{f.plates_remaining}</p>
                </div>
              </div>

              <button
                onClick={() => openServeModal(f)}
                disabled={isProcessing === f.family_id}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 text-lg shadow-lg shadow-emerald-900/20 border-b-4 border-emerald-800 active:border-b-0 uppercase tracking-widest"
              >
                Serve Plates
              </button>

              {isProcessing === f.family_id && (
                <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center">
                  <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
                </div>
              )}
            </div>
          ))}

          {activeFamilies.length === 0 && !isLoading && (
            <div className="text-center py-16 bg-slate-900/20 rounded-[2.5rem] border-4 border-dashed border-slate-800/50">
              <p className="text-xl font-black text-slate-600 uppercase tracking-widest">All Sets Served</p>
            </div>
          )}

          {exhaustedFamilies.length > 0 && (
            <div className="pt-10 border-t border-slate-800/50">
              <h3 className="text-xs font-black text-slate-600 uppercase tracking-[0.3em] mb-6 px-2">Recently Completed ({exhaustedFamilies.length})</h3>
              <div className="grid grid-cols-1 gap-3">
                {exhaustedFamilies.map(f => (
                  <div key={f.family_id} className="bg-slate-900/30 border border-slate-800/40 rounded-2xl p-4 flex justify-between items-center opacity-40 grayscale">
                    <div>
                      <p className="font-black text-slate-400 text-lg tracking-tight">{f.surname}</p>
                      <p className="text-xs text-slate-600 font-bold uppercase tracking-wider">{f.head_name}</p>
                    </div>
                    <span className="text-red-500/50 font-black text-2xl lining-nums tracking-tighter">0</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SERVE MODAL */}
      {selectedFamily && (
        <div
          className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-slate-950/95 backdrop-blur-xl p-0 sm:p-4 animate-in fade-in duration-300"
          onClick={() => setSelectedFamily(null)}
        >
          <div
            className="w-full max-w-sm bg-slate-900 border-t sm:border border-slate-800 rounded-t-[2.5rem] sm:rounded-[2.5rem] p-10 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center mb-10">
              <h2 className="text-4xl font-black mb-2 tracking-tighter text-white">{selectedFamily.surname}</h2>
              <p className="text-sm font-black text-slate-500 uppercase tracking-widest">
                Max Stock: <span className="text-white bg-slate-950 px-2 py-1 rounded-lg ml-1">{selectedFamily.plates_remaining}</span>
              </p>
            </div>

            <div className="mb-10">
              <label className="text-[10px] uppercase font-black text-slate-600 tracking-[0.3em] block mb-6 text-center">
                Quantity to Serve
              </label>
              <div className="flex items-center justify-center gap-8">
                <button
                  onClick={() => setCustomQty(Math.max(1, customQty - 1))}
                  className="w-16 h-16 bg-slate-800 rounded-2xl text-3xl font-black text-slate-400 hover:bg-slate-700 transition active:scale-90 border border-slate-700"
                >−</button>
                <div className="w-20 text-center">
                  <span className="text-6xl font-black text-white lining-nums tracking-tighter">{customQty}</span>
                </div>
                <button
                  onClick={() => setCustomQty(Math.min(selectedFamily.plates_remaining, customQty + 1))}
                  className="w-16 h-16 bg-emerald-500/10 text-emerald-400 border-2 border-emerald-500/20 rounded-2xl text-3xl font-black hover:bg-emerald-500/20 transition active:scale-90 shadow-xl shadow-emerald-500/5"
                >+</button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 mb-4 shadow-inner">
                <p className="text-[10px] uppercase font-black text-slate-600 mb-2 tracking-widest">Inventory Projection</p>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-400 uppercase tracking-tighter">Remaining After:</span>
                  <span className={`text-2xl font-black lining-nums tracking-tighter ${selectedFamily.plates_remaining - customQty === 0 ? 'text-red-500/80' : 'text-emerald-500/80'}`}>
                    {selectedFamily.plates_remaining - customQty}
                  </span>
                </div>
              </div>
              <button
                onClick={handleServe}
                disabled={isProcessing === selectedFamily.family_id}
                className="w-full bg-emerald-500 text-white font-black py-6 rounded-2xl hover:bg-emerald-400 transition-all shadow-2xl shadow-emerald-500/10 text-xl border-b-4 border-emerald-700 active:border-b-0 uppercase tracking-widest"
              >
                Authorize ({customQty})
              </button>
              <button
                onClick={() => setSelectedFamily(null)}
                className="w-full bg-transparent text-slate-600 font-black py-4 rounded-xl hover:text-slate-400 transition-all uppercase tracking-widest text-xs"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
