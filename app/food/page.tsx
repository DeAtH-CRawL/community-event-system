'use client';

import { useState, useEffect, useMemo } from 'react';
import { getActiveEntries, consumeCoupons, type ActiveEntry } from '@/src/lib/actions';

const DEFAULT_EVENT = "Community Dinner 2024";

export default function FoodCounterPage() {
  const [entries, setEntries] = useState<ActiveEntry[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date>(new Date());

  const updateEntries = async () => {
    setIsLoading(true);
    try {
      const activeEntries = await getActiveEntries(DEFAULT_EVENT);
      setEntries(Array.isArray(activeEntries) ? activeEntries : []);
      setLastSync(new Date());
    } catch (err) {
      console.error('getActiveEntries failed', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    updateEntries();
    const interval = setInterval(updateEntries, 30000);
    return () => clearInterval(interval);
  }, []);

  const filteredEntries = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return entries;
    return entries.filter((entry) =>
      entry.surname.toLowerCase().includes(trimmed) ||
      entry.head_name.toLowerCase().includes(trimmed)
    );
  }, [entries, search]);

  const handleRedeem = async (entryId: string, quantity: number) => {
    if (quantity > 3) {
      if (!window.confirm(`GIVE ${quantity} PLATES? Please confirm.`)) return;
    }

    setIsProcessing(entryId);
    try {
      const result = await consumeCoupons({
        role: 'volunteer',
        entryId: entryId,
        quantity: quantity
      });

      if (!result.success) {
        window.alert(result.message || 'Error processing request.');
        await updateEntries();
      } else {
        await updateEntries();
      }
    } catch (err) {
      window.alert('Connection problem. Check internet.');
    } finally {
      setIsProcessing(null);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col">
      <div className="w-full max-w-xl mx-auto px-4 py-6 flex-1 flex flex-col">
        <header className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-emerald-400">
              Food Counter
            </h1>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">
              {isLoading ? 'Syncing…' : `Last Sync: ${lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
            </p>
          </div>
          <button
            onClick={updateEntries}
            className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all active:scale-95 shadow-lg"
          >
            🔄
          </button>
        </header>

        <div className="mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Surname / Head Name…"
            className="w-full rounded-2xl border-4 border-slate-800 bg-slate-900 px-6 py-4 text-xl font-black placeholder:text-slate-700 focus:outline-none focus:border-emerald-500 transition-all shadow-xl"
          />
        </div>

        <section className="flex-1 overflow-y-auto pb-6 space-y-4">
          {filteredEntries.length === 0 ? (
            <div className="text-center py-20">
              {search ? (
                <>
                  <p className="text-xl font-black text-slate-500">No Match Found</p>
                  <p className="text-slate-700 font-bold mt-1">Is the name spelled correctly?</p>
                </>
              ) : (
                <>
                  <p className="text-xl font-black text-slate-500">No Active Families</p>
                  <p className="text-slate-700 font-bold mt-1">New entries will appear here automatically.</p>
                </>
              )}
            </div>
          ) : (
            filteredEntries.map((entry) => {
              const isProcessingThis = isProcessing === entry.id;
              const globalProcessing = isProcessing !== null;

              return (
                <div
                  key={entry.id}
                  className={`w-full rounded-[2.5rem] bg-slate-900 border-2 border-slate-800 p-6 shadow-2xl transition-all relative overflow-hidden ${isProcessingThis ? 'ring-2 ring-emerald-500 scale-[0.98]' : ''
                    }`}
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex-1 mr-4">
                      <h2 className="text-2xl font-black text-white leading-tight">
                        {entry.surname}
                      </h2>
                      <p className="text-sm text-slate-500 font-black uppercase tracking-wider">
                        {entry.head_name}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                        Left
                      </p>
                      <p className="text-4xl font-black text-emerald-400">
                        {entry.remaining_coupons}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[1, 2, 3].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => handleRedeem(entry.id, num)}
                        disabled={entry.remaining_coupons < num || globalProcessing}
                        className={`rounded-2xl py-5 text-xl font-black transition-all shadow-lg active:scale-95 disabled:opacity-50 ${entry.remaining_coupons >= num
                            ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-emerald-500/10'
                            : 'bg-slate-800 text-slate-600 border-0 cursor-not-allowed'
                          }`}
                      >
                        {isProcessingThis ? '…' : `GIVE ${num}`}
                      </button>
                    ))}
                  </div>

                  {isProcessingThis && (
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center">
                      <p className="text-xs font-black text-emerald-400 animate-pulse tracking-widest uppercase">Processing Request…</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}
