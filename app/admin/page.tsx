'use client';

import { useState, useEffect, useMemo } from 'react';
import {
    getAllEntries,
    adjustCoupons,
    updateEntryStatus,
    getEntryHistory,
    getEventSnapshot,
    type ActiveEntry,
    type AuditLogEntry
} from '@/src/lib/actions';

const DEFAULT_EVENT = "Community Dinner 2024";

export default function AdminDashboard() {
    const [entries, setEntries] = useState<ActiveEntry[]>([]);
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [snapshot, setSnapshot] = useState({ totalFamilies: 0, totalPlatesServed: 0, totalGuests: 0 });

    // Modals state
    const [selectedEntry, setSelectedEntry] = useState<ActiveEntry | null>(null);
    const [history, setHistory] = useState<AuditLogEntry[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [showAdjustment, setShowAdjustment] = useState(false);
    const [adjustmentValue, setAdjustmentValue] = useState(0);
    const [adjReason, setAdjReason] = useState('');

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [entriesData, snapshotData] = await Promise.all([
                getAllEntries(DEFAULT_EVENT),
                getEventSnapshot(DEFAULT_EVENT)
            ]);
            setEntries(Array.isArray(entriesData) ? entriesData : []);
            setSnapshot(snapshotData);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return entries;
        return entries.filter(e =>
            e.surname.toLowerCase().includes(q) ||
            e.head_name.toLowerCase().includes(q)
        );
    }, [entries, search]);

    const handleOpenHistory = async (entry: ActiveEntry) => {
        setSelectedEntry(entry);
        setHistory([]);
        setIsHistoryLoading(true);
        try {
            const data = await getEntryHistory(entry.family_id, entry.event_id);
            setHistory(data);
        } catch (err) {
            console.error(err);
        } finally {
            setIsHistoryLoading(false);
        }
    };

    const handleAdjustment = async () => {
        if (!selectedEntry || adjustmentValue === 0) return;
        try {
            const res = await adjustCoupons({
                role: 'admin',
                entryId: selectedEntry.id,
                adjustment: adjustmentValue,
                details: adjReason || `Admin adjustment: ${adjustmentValue > 0 ? '+' : ''}${adjustmentValue} plates.`
            });
            if (res.success) {
                setShowAdjustment(false);
                setAdjustmentValue(0);
                setAdjReason('');
                loadData();
            } else {
                window.alert(res.message);
            }
        } catch (err) {
            window.alert('Adjustment failed due to a network error.');
        }
    };

    const handleStatusToggle = async (entry: ActiveEntry) => {
        const next = entry.status === 'CLOSED' ? 'ACTIVE' : 'CLOSED';
        if (!window.confirm(`Set status to ${next}?`)) return;
        try {
            const res = await updateEntryStatus({
                role: 'admin',
                entryId: entry.id,
                newStatus: next
            });
            if (res.success) {
                loadData();
            } else {
                window.alert(res.message);
            }
        } catch (err) {
            window.alert('Status update failed due to a network error.');
        }
    };

    return (
        <main className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8">
            <div className="max-w-6xl mx-auto">
                <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                    <div>
                        <h1 className="text-4xl font-black tracking-tight text-white mb-1">Admin Panel</h1>
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Event: {DEFAULT_EVENT}</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={loadData} className="px-6 py-2 bg-emerald-500 text-slate-950 rounded-xl font-black hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/10">Refresh Data</button>
                    </div>
                </header>

                {/* Event Snapshot */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
                    <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-6">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Families Entered</p>
                        <p className="text-4xl font-black text-white">{snapshot.totalFamilies}</p>
                    </div>
                    <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-6">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Plates Served</p>
                        <p className="text-4xl font-black text-blue-400">{snapshot.totalPlatesServed}</p>
                    </div>
                    <div className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-6">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Guests Total</p>
                        <p className="text-4xl font-black text-purple-400">{snapshot.totalGuests}</p>
                    </div>
                </div>

                <div className="mb-8">
                    <input
                        type="text"
                        placeholder="Search Live Entries (Surname / Head)…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full max-w-md bg-slate-900 border-4 border-slate-800 rounded-2xl px-6 py-4 text-lg font-black focus:border-emerald-500 outline-none transition-all shadow-xl"
                    />
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b-2 border-slate-800 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                                <th className="pb-4 px-2 text-center">Identity</th>
                                <th className="pb-4 px-2">Type</th>
                                <th className="pb-4 px-2">Coupons</th>
                                <th className="pb-4 px-2">Status</th>
                                <th className="pb-4 px-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(e => (
                                <tr key={e.id} className="border-b border-slate-900 hover:bg-white/5 transition-colors">
                                    <td className="py-5 px-2">
                                        <p className="font-black text-xl text-white leading-none mb-1">{e.surname}</p>
                                        <p className="text-sm text-slate-500 font-bold">{e.head_name}</p>
                                    </td>
                                    <td className="py-5 px-2">
                                        <div className="flex gap-2 text-[10px] font-black uppercase">
                                            <span className="bg-blue-500/10 text-blue-400 px-2 py-1 rounded-lg">M: {e.members_present}</span>
                                            <span className="bg-purple-500/10 text-purple-400 px-2 py-1 rounded-lg">G: {e.guest_count}</span>
                                        </div>
                                    </td>
                                    <td className="py-5 px-2">
                                        <p className="font-black text-2xl text-emerald-400">{e.remaining_coupons} <span className="text-xs text-slate-600 font-black">/ {e.total_coupons}</span></p>
                                    </td>
                                    <td className="py-5 px-2">
                                        <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${e.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400' :
                                            e.status === 'FOOD_EXHAUSTED' ? 'bg-amber-500/10 text-amber-400' :
                                                'bg-slate-700 text-slate-400'
                                            }`}>
                                            {e.status.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="py-5 px-2 text-right space-x-2">
                                        <button onClick={() => { setSelectedEntry(e); setShowAdjustment(true); }} className="text-[10px] font-black uppercase tracking-widest bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 px-4 py-2 rounded-xl transition-all">Adjust</button>
                                        <button onClick={() => handleStatusToggle(e)} className="text-[10px] font-black uppercase tracking-widest bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl transition-all">{e.status === 'CLOSED' ? 'Open' : 'Close'}</button>
                                        <button onClick={() => handleOpenHistory(e)} className="text-[10px] font-black uppercase tracking-widest bg-slate-800 hover:bg-blue-500 hover:text-white px-4 py-2 rounded-xl transition-all">History</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {isLoading && <p className="text-center py-12 font-black text-slate-600 tracking-widest uppercase animate-pulse">Syncing Entries…</p>}
                    {!isLoading && filtered.length === 0 && <p className="text-center py-20 text-slate-500 font-black text-xl">No active entries matching search.</p>}
                </div>
            </div>

            {/* History Modal (Audit Trail) */}
            {selectedEntry && !showAdjustment && history.length > 0 && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-[2.5rem] p-10 max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-10">
                            <div>
                                <h3 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-1">Audit Trail</h3>
                                <h2 className="text-3xl font-black">{selectedEntry.surname} Family</h2>
                            </div>
                            <button onClick={() => setSelectedEntry(null)} className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-2xl font-black text-slate-500 hover:text-white">×</button>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-6 pr-4">
                            {history.map(log => (
                                <div key={log.id} className="relative pl-8 before:absolute before:left-0 before:top-4 before:w-2 before:h-2 before:bg-blue-500 before:rounded-full before:shadow-[0_0_10px_rgba(59,130,246,1)]">
                                    <div className="bg-slate-800/40 p-5 rounded-3xl border border-slate-700/50">
                                        <div className="flex justify-between items-start mb-3">
                                            <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${log.action_type === 'CHECK_IN' ? 'bg-emerald-500 text-slate-950' :
                                                log.action_type === 'CONSUME' ? 'bg-blue-500 text-white' :
                                                    'bg-amber-500 text-slate-950'
                                                }`}>
                                                {log.action_type}
                                            </span>
                                            <span className="text-[10px] text-slate-500 font-black uppercase tracking-tighter">{new Date(log.created_at).toLocaleTimeString()}</span>
                                        </div>
                                        <p className="text-base font-bold text-slate-200 mb-2">{log.details}</p>
                                        <p className="text-[10px] text-slate-600 font-black tracking-widest uppercase">Operator: {log.actor_role}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Adjustment Modal */}
            {showAdjustment && selectedEntry && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 duration-200">
                        <h2 className="text-3xl font-black mb-2">Adjust Count</h2>
                        <p className="text-sm text-slate-500 mb-10 font-black uppercase tracking-widest">{selectedEntry.surname} • {selectedEntry.head_name}</p>

                        <div className="space-y-6 mb-10">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-4 tracking-widest text-center">Plates Adjustment (+ or -)</label>
                                <div className="flex items-center gap-6">
                                    <button onClick={() => setAdjustmentValue(v => v - 1)} className="w-16 h-16 bg-slate-800 rounded-3xl text-3xl font-black hover:bg-slate-700 active:scale-95 transition-all">-</button>
                                    <input
                                        type="number"
                                        value={adjustmentValue}
                                        onChange={e => setAdjustmentValue(Number(e.target.value))}
                                        className="flex-1 bg-slate-950 text-center text-4xl font-black py-4 rounded-3xl outline-none border-4 border-slate-800 focus:border-emerald-500 transition-all font-mono"
                                    />
                                    <button onClick={() => setAdjustmentValue(v => v + 1)} className="w-16 h-16 bg-emerald-500 text-slate-950 rounded-3xl text-3xl font-black hover:bg-emerald-400 active:scale-95 transition-all">+</button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-3 tracking-widest">Reason for Audit Log</label>
                                <textarea
                                    value={adjReason}
                                    onChange={e => setAdjReason(e.target.value)}
                                    placeholder="e.g., Guest added manually or Correction"
                                    className="w-full bg-slate-950 rounded-3xl p-5 text-sm font-black outline-none border-4 border-slate-800 focus:border-emerald-500 transition-all h-32 resize-none placeholder:text-slate-800"
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <button onClick={handleAdjustment} className="w-full py-5 font-black text-xl bg-emerald-500 text-slate-950 rounded-2xl shadow-xl shadow-emerald-500/10 active:scale-95 transition-all">APPLY ADJUSTMENT</button>
                            <button onClick={() => setShowAdjustment(false)} className="w-full py-4 font-black text-slate-500 hover:text-white transition-colors">CANCEL</button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
