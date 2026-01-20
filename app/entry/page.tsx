'use client';

import { useEffect, useMemo, useState } from 'react';
import { checkInFamily, searchFamilies, deleteEntry, type FamilyRow } from '@/src/lib/actions';

const DEFAULT_EVENT = "Community Dinner 2024";

export default function EntryGatePage() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<FamilyRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState<FamilyRow | null>(null);

  // Modal state
  const [checkInStep, setCheckInStep] = useState<'DETAILS' | 'COUNTS'>('DETAILS');
  const [membersPresent, setMembersPresent] = useState<number | ''>('');
  const [guestCount, setGuestCount] = useState<number | ''>(0);
  const [isSaving, setIsSaving] = useState(false);

  // Hardening: Track last check-in for quick Undo
  const [lastCheckIn, setLastCheckIn] = useState<{ id: string; name: string } | null>(null);

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
        const data = await searchFamilies(search);
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

  const totalCoupons = useMemo(() => {
    const members = typeof membersPresent === 'number' ? membersPresent : 0;
    const guests = typeof guestCount === 'number' ? guestCount : 0;
    return members + guests;
  }, [membersPresent, guestCount]);

  const openModal = (family: FamilyRow) => {
    setSelectedFamily(family);
    setCheckInStep('DETAILS');
    setMembersPresent(family.family_size);
    setGuestCount(0);
  };

  const closeModal = () => {
    setSelectedFamily(null);
    setCheckInStep('DETAILS');
    setMembersPresent('');
    setGuestCount(0);
  };

  const handleConfirm = async () => {
    if (!selectedFamily) return;

    const members = typeof membersPresent === 'number' ? membersPresent : 0;
    const guests = typeof guestCount === 'number' ? guestCount : 0;

    setIsSaving(true);
    try {
      const result = await checkInFamily({
        role: 'volunteer',
        eventName: DEFAULT_EVENT,
        familyId: selectedFamily.id,
        members_present: members,
        guest_count: guests,
        coupons_per_member: 1,
        guest_coupon_price: 250,
      });

      if (result.error) {
        window.alert(`Error: ${result.message}`);
        if (result.error === 'DUPLICATE_ENTRY') {
          closeModal();
        }
        return;
      }

      setLastCheckIn({
        id: result.id!,
        name: `${selectedFamily.surname} (${selectedFamily.head_name})`
      });
      setSearch('');
      closeModal();
    } catch (err) {
      console.error(err);
      window.alert('Check-in failed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUndo = async () => {
    if (!lastCheckIn) return;
    if (!window.confirm(`REVERSE Check-in for ${lastCheckIn.name}?`)) return;

    setIsSaving(true);
    try {
      const res = await deleteEntry({ role: 'volunteer', entryId: lastCheckIn.id });
      if (res.success) {
        setLastCheckIn(null);
        window.alert('Check-in REVERSED successfully.');
      } else {
        window.alert(res.message);
      }
    } catch (err) {
      window.alert('Undo failed.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col">
      <div className="w-full max-w-xl mx-auto px-4 py-6 flex-1 flex flex-col">
        <header className="mb-6">
          <h1 className="text-3xl font-black tracking-tight mb-2 text-emerald-400">
            Entry Gate
          </h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">
            Search Family (Name or Phone)
          </p>
        </header>

        <div className="mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Surname / Head / Phone…"
            className="w-full rounded-2xl border-4 border-slate-800 bg-slate-900 px-6 py-5 text-2xl font-black placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-all shadow-2xl"
          />
        </div>

        <section className="flex-1 overflow-y-auto pb-24 space-y-4">
          {isLoading && search.length > 0 && (
            <p className="text-center font-bold text-slate-500 animate-pulse">Searching…</p>
          )}

          {results.map((family) => (
            <button
              key={family.id}
              type="button"
              onClick={() => openModal(family)}
              className="w-full text-left rounded-3xl bg-slate-900 border-2 border-slate-800 p-6 hover:border-emerald-500 transition-all active:scale-[0.98] shadow-lg group"
            >
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-2xl font-black group-hover:text-emerald-400 transition-colors">
                  {family.surname}
                </h2>
                <span className="bg-slate-800 px-4 py-1.5 rounded-xl text-xs font-black text-slate-400">
                  SIZE: {family.family_size}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <p className="text-lg text-slate-300 font-bold">
                  Head: {family.head_name}
                </p>
                <p className="text-sm text-slate-500 font-black font-mono">
                  {family.phone}
                </p>
              </div>
            </button>
          ))}

          {search && results.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <p className="text-xl font-bold text-slate-500">No families found.</p>
              <p className="text-slate-600 mt-2">Check spelling or search by Phone Number.</p>
            </div>
          )}
        </section>

        {/* Hardening: Recent Action Footer */}
        {lastCheckIn && !selectedFamily && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-sm px-4">
            <div className="bg-emerald-500 text-slate-950 rounded-2xl p-4 shadow-2xl flex items-center justify-between border-2 border-emerald-400 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex-1 min-w-0 mr-4">
                <p className="text-[10px] font-black uppercase opacity-60">Last Checked In</p>
                <p className="text-sm font-black truncate">{lastCheckIn.name}</p>
              </div>
              <button
                onClick={handleUndo}
                className="bg-slate-950 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-900 active:scale-95"
              >
                Undo
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedFamily && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-[2.5rem] bg-slate-900 border border-slate-800 shadow-2xl p-8 animate-in zoom-in-95 duration-200">
            {checkInStep === 'DETAILS' ? (
              <div className="space-y-6">
                <div className="text-center">
                  <h3 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-4">Step 1: Verify Identity</h3>
                  <h2 className="text-4xl font-black mb-2">{selectedFamily.surname}</h2>
                  <p className="text-xl text-slate-400 font-bold mb-1">{selectedFamily.head_name}</p>
                  <p className="text-sm text-slate-500 font-black font-mono tracking-tighter">{selectedFamily.phone}</p>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => setCheckInStep('COUNTS')}
                    className="w-full rounded-2xl bg-blue-500 text-slate-950 font-black py-5 text-xl transition-all shadow-lg active:scale-95"
                  >
                    YES, THAT'S THEM
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="w-full rounded-2xl bg-slate-800 text-slate-400 font-bold py-4 text-base transition-all"
                  >
                    WRONG FAMILY, BACK
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="text-center">
                  <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-4">Step 2: Select Count</h3>
                  <div className="inline-flex bg-slate-800 px-6 py-2 rounded-full text-slate-400 font-black text-sm uppercase">
                    Package Size: {selectedFamily.family_size}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase text-center tracking-widest">Members</label>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setMembersPresent(m => Math.max(0, (m as number) - 1))} className="w-10 h-10 bg-slate-800 rounded-full font-black">-</button>
                      <span className="flex-1 text-3xl font-black text-center">{membersPresent}</span>
                      <button onClick={() => setMembersPresent(m => (m as number) + 1)} className="w-10 h-10 bg-slate-800 rounded-full font-black">+</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase text-center tracking-widest">Guests</label>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setGuestCount(g => Math.max(0, (g as number) - 1))} className="w-10 h-10 bg-slate-800 rounded-full font-black">-</button>
                      <span className="flex-1 text-3xl font-black text-center text-purple-400">{guestCount}</span>
                      <button onClick={() => setGuestCount(g => (g as number) + 1)} className="w-10 h-10 bg-slate-800 rounded-full font-black">+</button>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-800 rounded-3xl p-6 border-2 border-emerald-500/30 flex items-baseline justify-between">
                  <span className="text-slate-400 font-bold">TOTAL COUPONS</span>
                  <span className="text-4xl font-black text-emerald-400">{totalCoupons}</span>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={isSaving}
                    className="w-full rounded-2xl bg-emerald-500 text-slate-950 font-black py-5 text-xl transition-all shadow-lg active:scale-95 disabled:opacity-50"
                  >
                    {isSaving ? 'RECORDING…' : `ISSUE ${totalCoupons} COUPONS`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckInStep('DETAILS')}
                    className="w-full rounded-2xl bg-slate-800 text-slate-400 font-bold py-4 text-base transition-all"
                  >
                    BACK TO STEP 1
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isSaving && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-8 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
          <p className="text-emerald-400 font-black tracking-widest uppercase">Processing Request…</p>
        </div>
      )}
    </main>
  );
}
