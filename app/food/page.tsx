'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { getCheckedInFamilies, servePlates, type Family } from '@/src/lib/actions';

const DEFAULT_EVENT = "Community Dinner 2024";

// Init client-side supabase for subscribe
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function FoodCounterPage() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date>(new Date());

  // Custom Serve Modal
  const [selectedFamily, setSelectedFamily] = useState<Family | null>(null);
  const [customQty, setCustomQty] = useState(1);
  const [stationId, setStationId] = useState('');

  useEffect(() => {
    setStationId(localStorage.getItem('station_id') || '');
  }, []);

  const loadFamilies = async () => {
    setIsLoading(true);
    try {
      const data = await getCheckedInFamilies(DEFAULT_EVENT);
      setFamilies(Array.isArray(data) ? data : []);
      setLastSync(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFamilies();

    // REALTIME SUBSCRIPTION
    const channel = supabase.channel('food-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servings' }, () => {
        loadFamilies(); // refresh on any change
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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

    setIsProcessing(selectedFamily.id);
    try {
      const result = await servePlates({
        role: 'volunteer',
        eventName: DEFAULT_EVENT,
        familyId: selectedFamily.id,
        quantity: customQty,
        stationId: stationId
      });

      if (!result.success) {
        alert(result.message);
      } else {
        // Close modal on success
        setSelectedFamily(null);
        setCustomQty(1);
      }
    } catch (err) {
      alert('Failed to serve. Check internet.');
    } finally {
      setIsProcessing(null);
    }
  };

  const openServeModal = (f: Family) => {
    setSelectedFamily(f);
    setCustomQty(1); // Reset to 1 default
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col">
      <div className="w-full max-w-xl mx-auto px-4 py-6 flex-1 flex flex-col">
        {/* Header */}
        <header className="mb-6 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Food Counter</h1>
          <div className="text-right">
            <p className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">
              Last Sync: {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
            {stationId && <p className="text-[10px] text-emerald-500 font-bold uppercase">{stationId}</p>}
          </div>
        </header>

        {/* Search */}
        <div className="mb-6">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search Family..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-lg font-bold outline-none focus:border-emerald-500 transition-all"
          />
        </div>

        {/* List */}
        <div className="space-y-4 pb-10">
          {activeFamilies.map(f => (
            <div key={f.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold text-white leading-tight">{f.surname}</h3>
                  <p className="text-sm text-slate-500">{f.head_name}</p>
                  {f.guests > 0 && (
                    <span className="inline-block mt-1 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded uppercase tracking-wide">
                      + {f.guests} Guests
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase text-slate-500 font-bold">Remains</p>
                  <p className="text-4xl font-mono font-bold text-emerald-400">{f.plates_remaining}</p>
                </div>
              </div>

              <button
                onClick={() => openServeModal(f)}
                disabled={isProcessing === f.id}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
              >
                Serve Plates
              </button>

              {isProcessing === f.id && (
                <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>
          ))}

          {exhaustedFamilies.length > 0 && (
            <div className="pt-8 border-t border-slate-800/50">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Completed ({exhaustedFamilies.length})</h3>
              {exhaustedFamilies.map(f => (
                <div key={f.id} className="bg-slate-900/40 border border-slate-800/40 rounded-xl p-4 mb-2 flex justify-between opacity-60">
                  <div>
                    <p className="font-bold text-slate-400">{f.surname}</p>
                    <p className="text-xs text-slate-600">{f.head_name}</p>
                  </div>
                  <span className="text-red-500/50 font-mono font-bold">0</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SERVE MODAL */}
      {selectedFamily && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-xl font-bold mb-1">{selectedFamily.surname}</h2>
            <p className="text-sm text-slate-500 mb-6">Max available: <span className="text-white font-bold">{selectedFamily.plates_remaining}</span></p>

            <div className="mb-8">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-3 text-center">
                Quantity to Serve
              </label>
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setCustomQty(Math.max(1, customQty - 1))}
                  className="w-12 h-12 bg-slate-800 rounded-xl text-xl font-bold hover:bg-slate-700 transition"
                >-</button>
                <span className="text-4xl font-mono font-bold w-16 text-center">{customQty}</span>
                <button
                  onClick={() => setCustomQty(Math.min(selectedFamily.plates_remaining, customQty + 1))}
                  className="w-12 h-12 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xl font-bold hover:bg-emerald-500/30 transition"
                >+</button>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleServe}
                disabled={isProcessing === selectedFamily.id}
                className="w-full bg-emerald-500 text-white font-bold py-3.5 rounded-xl hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
              >
                Confirm Serve ({customQty})
              </button>
              <button
                onClick={() => setSelectedFamily(null)}
                className="w-full bg-transparent text-slate-400 font-bold py-3 rounded-xl hover:bg-slate-800 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
