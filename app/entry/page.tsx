'use client';

import { useEffect, useMemo, useState } from 'react';
import { mockEvent } from '@/src/db/seedData';
import { checkInFamily, searchFamilies, type FamilyRow } from '@/src/lib/actions';

export default function EntryGatePage() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<FamilyRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState<FamilyRow | null>(null);
  const [membersPresent, setMembersPresent] = useState<number | ''>('');
  const [guestCount, setGuestCount] = useState<number | ''>(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    const handle = setTimeout(async () => {
      try {
        const data = await searchFamilies(search);
        if (!cancelled) {
          setResults(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
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
    // New calculation: 1 plate per person
    return members + guests;
  }, [membersPresent, guestCount]);

  const openModal = (family: FamilyRow) => {
    setSelectedFamily(family);
    setMembersPresent(family.family_size);
    setGuestCount(0);
  };

  const closeModal = () => {
    setSelectedFamily(null);
    setMembersPresent('');
    setGuestCount(0);
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleConfirm = async () => {
    if (!selectedFamily) return;

    const members = typeof membersPresent === 'number' ? membersPresent : 0;
    const guests = typeof guestCount === 'number' ? guestCount : 0;

    setIsSaving(true);
    try {
      const result = await checkInFamily({
        eventName: "Community Dinner 2024",
        familyId: selectedFamily.id,
        members_present: members,
        guest_count: guests,
        coupons_per_member: mockEvent.coupons_per_member,
        guest_coupon_price: mockEvent.guest_coupon_price,
      });

      if (result.error === "DB_BLOCK") {
        if (typeof window !== 'undefined') {
          window.alert(result.message);
        }
        closeModal();
        return;
      }

      if (result.isDuplicate) {
        if (typeof window !== 'undefined') {
          window.alert(`⚠️ Volunteer Alert: This family already checked in. Proceeding with double entry.`);
        }
      } else {
        if (typeof window !== 'undefined') {
          window.alert(`Check-in Successful! ${totalCoupons} Coupons Generated`);
        }
      }

      setSearch(''); // Reset search state
      closeModal();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      if (typeof window !== 'undefined') {
        window.alert('Check-in failed. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const safeResults = Array.isArray(results) ? results : [];

  return (
    <main className="min-h-screen bg-slate-900 text-white flex flex-col">
      <div className="w-full max-w-xl mx-auto px-4 py-6 flex-1 flex flex-col">
        <header className="mb-4">
          <h1 className="text-2xl font-bold tracking-wide mb-2">
            Entry Gate
          </h1>
          <p className="text-sm text-slate-300">
            Search families by surname and record check-ins quickly.
          </p>
        </header>

        <div className="mb-4">
          <label
            htmlFor="surname-search"
            className="block text-xs font-semibold tracking-wide text-slate-300 mb-1 uppercase"
          >
            Search by Surname
          </label>
          <input
            id="surname-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type surname…"
            className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-base placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <section className="flex-1 overflow-y-auto pb-6 space-y-3">
          {isLoading && (
            <p className="text-center text-sm text-slate-400">Searching…</p>
          )}
          {safeResults.map((family) => (
            <button
              key={family.id}
              type="button"
              onClick={() => openModal(family)}
              className="w-full text-left rounded-2xl bg-slate-800 border border-slate-700 px-4 py-3 shadow-md active:scale-[0.99] transition-transform"
            >
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-lg font-semibold tracking-wide">
                  {family.surname} Family
                </span>
              </div>
              <p className="text-sm text-slate-300 mb-1">
                Head: <span className="font-medium">{family.head_name}</span>
              </p>
              <p className="text-xs text-slate-400">
                Members in package: {family.family_size}
              </p>
            </button>
          ))}

          {safeResults.length === 0 && (
            <p className="text-center text-sm text-slate-400 mt-8">
              No families found. Try a different surname.
            </p>
          )}
        </section>
      </div>

      {selectedFamily && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold mb-1">
                  Check-in: {selectedFamily.surname} Family
                </h2>
                <p className="text-sm text-slate-300">
                  Members in package: {selectedFamily.family_size}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-200 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label
                  htmlFor="members-present"
                  className="block text-xs font-semibold tracking-wide text-slate-300 mb-1 uppercase"
                >
                  Members Present
                </label>
                <input
                  id="members-present"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={selectedFamily.family_size}
                  value={membersPresent}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      setMembersPresent('');
                    } else {
                      setMembersPresent(Math.max(0, Number(value)));
                    }
                  }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div>
                <label
                  htmlFor="guest-count"
                  className="block text-xs font-semibold tracking-wide text-slate-300 mb-1 uppercase"
                >
                  Guest Count
                </label>
                <input
                  id="guest-count"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={guestCount}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      setGuestCount('');
                    } else {
                      setGuestCount(Math.max(0, Number(value)));
                    }
                  }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div className="mt-2 rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 flex items-center justify-between">
                <span className="text-sm text-slate-300">
                  Total Coupons
                </span>
                <span className="text-xl font-bold text-emerald-400">
                  {totalCoupons}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSaving}
              className={`w-full rounded-xl text-slate-900 font-extrabold tracking-wide py-3 text-base shadow-lg ${isSaving
                ? 'bg-emerald-300 cursor-not-allowed'
                : 'bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 shadow-emerald-500/30'
                }`}
            >
              {isSaving ? 'SAVING…' : 'CONFIRM ENTRY'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

