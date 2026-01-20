'use client';

import { useState, useEffect, useMemo } from 'react';
import { getActiveEntries, consumeCoupons, type ActiveEntry } from '@/src/lib/actions';

export default function FoodCounterPage() {
  const [entries, setEntries] = useState<ActiveEntry[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [redemptionQuantities, setRedemptionQuantities] = useState<Record<string, number>>({});

  // Get active entries and filter by ACTIVE status
  const updateEntries = async () => {
    setIsLoading(true);
    try {
      const allEntries = await getActiveEntries();
      const safe = Array.isArray(allEntries) ? allEntries : [];
      setEntries(safe.filter((e) => e.status === 'ACTIVE'));

      // Initialize quantities for new entries
      setRedemptionQuantities(prev => {
        const next = { ...prev };
        safe.forEach(e => {
          if (next[e.id] === undefined) next[e.id] = 1;
        });
        return next;
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('getActiveEntries failed', err);
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    updateEntries();
  }, []);

  // Filter entries by surname search
  const filteredEntries = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    const safeEntries = Array.isArray(entries) ? entries : [];
    if (!trimmed) return safeEntries;

    return safeEntries.filter((entry) =>
      entry.surname.toLowerCase().includes(trimmed)
    );
  }, [entries, search]);

  const handleConsume = async (entryId: string) => {
    const quantity = redemptionQuantities[entryId] || 1;
    try {
      const result = await consumeCoupons(entryId, quantity);
      if ((result as any).error) {
        if (typeof window !== 'undefined') {
          window.alert((result as any).message);
        }
      }
      await updateEntries();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('consumeCoupons failed', err);
    }
  };

  const handleQuantityChange = (entryId: string, val: string, max: number) => {
    const num = parseInt(val);
    if (isNaN(num)) return;
    setRedemptionQuantities(prev => ({
      ...prev,
      [entryId]: Math.min(Math.max(1, num), max)
    }));
  };

  return (
    <main className="min-h-screen bg-slate-900 text-white flex flex-col">
      <div className="w-full max-w-xl mx-auto px-4 py-6 flex-1 flex flex-col">
        <header className="mb-4">
          <h1 className="text-2xl font-bold tracking-wide mb-2">
            Food Counter
          </h1>
          <p className="text-sm text-slate-300">
            Track coupon consumption for active families.
          </p>
        </header>

        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by surname…"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <section className="flex-1 overflow-y-auto pb-6 space-y-3">
          {isLoading && (
            <p className="text-center text-sm text-slate-400">Loading…</p>
          )}
          {filteredEntries.length === 0 ? (
            <p className="text-center text-sm text-slate-400 mt-8">
              {search
                ? 'No active families found matching your search.'
                : 'No active families at the event yet.'}
            </p>
          ) : (
            filteredEntries.map((entry) => {
              const isCompleted = entry.remaining_coupons === 0;
              const canConsume = entry.remaining_coupons >= 1;
              const selectedQty = redemptionQuantities[entry.id] || 1;

              return (
                <div
                  key={entry.id}
                  className={`w-full rounded-2xl border px-4 py-4 shadow-md transition-colors ${isCompleted
                      ? 'bg-slate-700 border-slate-600'
                      : 'bg-slate-800 border-slate-700'
                    }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span
                          className={`text-lg font-bold tracking-wide ${isCompleted ? 'text-slate-400' : 'text-white'
                            }`}
                        >
                          {entry.surname} Family
                        </span>
                      </div>
                      <p
                        className={`text-sm ${isCompleted ? 'text-slate-500' : 'text-slate-300'
                          }`}
                      >
                        {entry.head_name}
                      </p>
                    </div>
                    <div className="ml-4 text-right">
                      {isCompleted ? (
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          ALL CONSUMED
                        </div>
                      ) : (
                        <>
                          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                            Remaining
                          </div>
                          <div className="text-3xl font-extrabold text-emerald-400">
                            {entry.remaining_coupons}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {!isCompleted && (
                    <div className="flex gap-3 mt-3">
                      <div className="flex-1 flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                          Plates
                        </label>
                        <input
                          type="number"
                          min="1"
                          max={entry.remaining_coupons}
                          value={selectedQty}
                          onChange={(e) => handleQuantityChange(entry.id, e.target.value, entry.remaining_coupons)}
                          className="w-full rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2.5 text-center font-bold text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div className="flex-[2] flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1 opacity-0">
                          Spacer
                        </label>
                        <button
                          type="button"
                          onClick={() => handleConsume(entry.id)}
                          disabled={!canConsume}
                          className={`w-full rounded-xl font-extrabold text-lg py-3 shadow-md transition-all active:scale-95 ${canConsume
                              ? 'bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-slate-900 shadow-emerald-500/20'
                              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                            }`}
                        >
                          Redeem {selectedQty > 1 ? `${selectedQty} Plates` : '1 Plate'}
                        </button>
                      </div>
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
