'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
    getAllFamiliesWithStatus,
    adjustPlates,
    getAuditHistory,
    getEventStats,
    resetEvent,
    getDistinctEventNames,
    getEventSummaries,
    type Family,
    type AuditLogEntry,
} from '@/src/lib/actions';
import { Toast } from '@/src/components/Toast';

// Client-side Supabase for Realtime
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminDashboard() {
    const [eventName, setEventName] = useState("Live Session");
    const [families, setFamilies] = useState<Family[]>([]);
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [stats, setStats] = useState({ totalFamilies: 0, familiesCheckedIn: 0, totalPlatesEntitled: 0, totalPlatesServed: 0 });

    // Sync state
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);

    // Summaries
    const [summaries, setSummaries] = useState<AuditLogEntry[]>([]);

    // Modal state
    const [selectedFamily, setSelectedFamily] = useState<Family | null>(null);
    const [history, setHistory] = useState<AuditLogEntry[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [showAdjustment, setShowAdjustment] = useState(false);
    const [adjustmentValue, setAdjustmentValue] = useState(0);
    const [adjReason, setAdjReason] = useState('');

    // Event Management
    const [showNewEventModal, setShowNewEventModal] = useState(false);
    const [newEventName, setNewEventName] = useState('');

    // Toast state
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
    }, []);

    const loadData = useCallback(async () => {
        try {
            // First identify exactly one current event
            const events = await getDistinctEventNames();
            const currentName = events[0];
            setEventName(currentName);

            const [familiesData, statsData, summaryData] = await Promise.all([
                getAllFamiliesWithStatus(currentName),
                getEventStats(currentName),
                getEventSummaries()
            ]);
            setFamilies(Array.isArray(familiesData) ? familiesData : []);
            setStats(statsData);
            setSummaries(summaryData);
        } catch (err) {
            console.error(err);
        }
    }, []);

    useEffect(() => {
        setIsLoading(true);
        loadData().finally(() => setIsLoading(false));
    }, [loadData]);

    // Real-time Subscription
    useEffect(() => {
        const channel = supabase.channel('admin-live')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'servings',
                    filter: `event_name=eq.${eventName}`
                },
                () => {
                    loadData();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [eventName, loadData]);

    const handleStartNewEvent = async () => {
        if (!newEventName.trim()) return;
        const name = newEventName.trim();

        try {
            // First capture current summary and reset
            const res = await resetEvent({ eventName: eventName });
            if (res.success) {
                setEventName(name);
                localStorage.setItem('current_event_name', name);
                setShowNewEventModal(false);
                setNewEventName('');
                await loadData();
                showToast(`System Reset & New Session Started: ${name}`);
            } else {
                showToast("Failed to initialize new event", "error");
            }
        } catch (err) {
            showToast("Error during initialization", "error");
        }
    };

    const handleReset = async () => {
        if (!window.confirm(`CRITICAL: This will ARCHIVE stats and CLEAR all current entries for "${eventName}". Continue?`)) {
            return;
        }

        try {
            const res = await resetEvent({ eventName: eventName });
            if (res.success) {
                showToast("Event reset successfully. Summary archived.");
                loadData();
            } else {
                showToast(res.message || "Failed to reset.", "error");
            }
        } catch (err) {
            showToast("Failed to reset.", "error");
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        setSyncResult(null);
        try {
            const response = await fetch('/api/sync-families', { method: 'POST' });
            const data = await response.json();
            if (data.success) {
                showToast(`Sync Complete: ${data.stats.synced} families updated.`);
                loadData();
            } else {
                showToast('Sync failed. Please check logs.', 'error');
            }
        } catch (err) {
            showToast('Network error during sync.', 'error');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleAdjustment = async () => {
        if (!selectedFamily || adjustmentValue === 0) return;
        try {
            const res = await adjustPlates({
                role: 'admin',
                eventName: eventName,
                familyId: selectedFamily.family_id,
                adjustment: adjustmentValue,
                reason: adjReason || `Admin Adjustment: ${adjustmentValue}`,
            });
            if (res.success) {
                showToast(`Adjusted ${selectedFamily.surname} by ${adjustmentValue}`);
                setShowAdjustment(false);
                setAdjustmentValue(0);
                setAdjReason('');
                loadData();
            } else {
                showToast(res.error || 'Adjustment failed.', 'error');
            }
        } catch (err) {
            showToast('Failed to apply adjustment.', 'error');
        }
    };

    const handleOpenHistory = async (f: Family) => {
        setSelectedFamily(f);
        setHistory([]);
        setIsHistoryLoading(true);
        try {
            const data = await getAuditHistory(eventName, f.family_id);
            setHistory(data);
        } finally {
            setIsHistoryLoading(false);
        }
    };

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return families;
        return families.filter((f) =>
            f.surname.toLowerCase().includes(q) ||
            f.head_name.toLowerCase().includes(q) ||
            (f.phone && f.phone.includes(q))
        );
    }, [families, search]);

    return (
        <main className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 relative">
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <header className="mb-10">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-10">
                        <div>
                            <h1 className="text-5xl font-black text-white tracking-tighter">Admin Control</h1>
                            <div className="mt-3 flex items-center gap-3">
                                <span className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></span>
                                <p className="text-xs text-slate-500 font-black uppercase tracking-[0.3em]">
                                    Live Session: <span className="text-emerald-400">{eventName}</span>
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex flex-col">
                                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2 ml-1">Current Session</label>
                                <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-3 text-sm font-black text-emerald-400 outline-none min-w-[220px] shadow-lg flex items-center gap-2">
                                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                                    {eventName}
                                </div>
                            </div>

                            <button
                                onClick={() => setShowNewEventModal(true)}
                                className="bg-slate-900 hover:bg-slate-800 border-2 border-red-500/20 hover:border-red-500/40 text-red-500 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 flex flex-col items-center leading-tight shadow-xl"
                            >
                                <span className="text-[9px] opacity-60 mb-0.5">Initialize</span>
                                <span>New Event</span>
                            </button>

                            <button
                                onClick={handleSync}
                                disabled={isSyncing}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all disabled:opacity-50 shadow-xl shadow-blue-900/20 border-b-4 border-blue-800 active:border-b-0 active:scale-95"
                            >
                                {isSyncing ? 'Syncing...' : 'Sync Sheet Data'}
                            </button>
                        </div>
                    </div>
                </header>

                {/* Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
                    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full -mr-8 -mt-8 group-hover:bg-emerald-500/10 transition-colors"></div>
                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2">Families Present</p>
                        <p className="text-4xl font-black text-emerald-400 lining-nums racking-tighter">{stats.familiesCheckedIn} <span className="text-lg text-slate-700 font-bold ml-1">/ {stats.totalFamilies}</span></p>
                    </div>
                    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full -mr-8 -mt-8 group-hover:bg-blue-500/10 transition-colors"></div>
                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2">Capacity Utilization</p>
                        <p className="text-4xl font-black text-blue-400 lining-nums tracking-tighter">{stats.totalPlatesServed} <span className="text-lg text-slate-700 font-bold ml-1">/ {stats.totalPlatesEntitled}</span></p>
                    </div>
                    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full -mr-8 -mt-8 group-hover:bg-purple-500/10 transition-colors"></div>
                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2">Avg Plates / Fam</p>
                        <p className="text-4xl font-black text-purple-400 lining-nums tracking-tighter">
                            {stats.familiesCheckedIn > 0 ? (stats.totalPlatesServed / stats.familiesCheckedIn).toFixed(1) : '0.0'}
                        </p>
                    </div>
                    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full -mr-8 -mt-8 group-hover:bg-amber-500/10 transition-colors"></div>
                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2">Surplus Capacity</p>
                        <p className="text-4xl font-black text-white lining-nums tracking-tighter">{stats.totalPlatesEntitled - stats.totalPlatesServed}</p>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl">
                    <div className="p-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-slate-900/50">
                        <div className="relative w-full max-w-md">
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search live records…"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-12 py-3.5 text-sm font-bold focus:border-emerald-500 outline-none transition-all focus:ring-4 focus:ring-emerald-500/5"
                            />
                            <svg className="w-5 h-5 text-slate-600 absolute left-4 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                            Showing {filtered.length} of {families.length} families
                        </p>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-800/40 text-slate-500 text-[10px] uppercase font-black tracking-[0.2em]">
                                <tr>
                                    <th className="p-6">Family Entity</th>
                                    <th className="p-6 text-center">Entitlement Breakdown</th>
                                    <th className="p-6 text-center">Inventory</th>
                                    <th className="p-6 text-center">Status</th>
                                    <th className="p-6 text-right">Operations</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {filtered.map(f => (
                                    <tr key={f.family_id} className="hover:bg-slate-800/20 transition-colors group">
                                        <td className="p-6">
                                            <p className="font-black text-white text-lg tracking-tight group-hover:text-emerald-400 transition-colors">{f.surname}</p>
                                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">{f.head_name}</p>
                                        </td>
                                        <td className="p-6 text-center">
                                            <span className="font-black text-slate-200 text-xl lining-nums">{f.plates_entitled}</span>
                                            <div className="text-[10px] text-slate-600 font-black mt-1">
                                                SIZE: {f.family_size}
                                                {f.guests > 0 && <span className="text-emerald-500 ml-1"> + {f.guests} GUESTS</span>}
                                            </div>
                                        </td>
                                        <td className="p-6 text-center">
                                            <span className={`font-black text-xl lining-nums ${f.plates_remaining === 0 && f.checked_in_at ? 'text-red-500/80' : 'text-emerald-400/80'}`}>
                                                {f.plates_remaining}
                                            </span>
                                        </td>
                                        <td className="p-6 text-center">
                                            {f.checked_in_at ? (
                                                <div className="flex flex-col items-center">
                                                    <span className="inline-block w-4 h-4 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.3)] mb-1"></span>
                                                    <span className="text-[9px] font-black text-slate-500 uppercase">ACTIVE</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center opacity-30">
                                                    <span className="inline-block w-4 h-4 bg-slate-700 rounded-full mb-1"></span>
                                                    <span className="text-[9px] font-black text-slate-600 uppercase">PENDING</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-6 text-right">
                                            <div className="flex items-center justify-end gap-4">
                                                {f.checked_in_at && (
                                                    <button
                                                        onClick={() => { setSelectedFamily(f); setShowAdjustment(true); }}
                                                        className="text-[10px] font-black uppercase text-slate-500 hover:text-white bg-slate-800/50 px-4 py-2 rounded-lg transition-all border border-slate-700/50"
                                                    >
                                                        Adjust
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleOpenHistory(f)}
                                                    className="text-[10px] font-black uppercase text-blue-500 hover:text-white bg-blue-500/10 px-4 py-2 rounded-lg transition-all border border-blue-500/20"
                                                >
                                                    Audit
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Session Snapshots */}
                <div className="mt-12">
                    <h2 className="text-xl font-black text-white uppercase tracking-widest mb-6 px-2 flex items-center gap-3">
                        <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                        Session Snapshots (Archived)
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {summaries.map((s) => {
                            const data = s.after_value || {};
                            return (
                                <div key={s.id} className="bg-slate-900/40 border border-slate-800 rounded-[2rem] p-8 hover:border-slate-700 transition-all group">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">Session Target</p>
                                            <h3 className="text-2xl font-black text-white group-hover:text-emerald-400 transition-colors">{s.event_name}</h3>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest leading-none">
                                                {new Date(s.created_at).toLocaleDateString()}
                                            </p>
                                            <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest">
                                                {new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Families</span>
                                            <span className="text-lg font-black text-white lining-nums">{data.familiesCheckedIn} / {data.totalFamilies}</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Plates Served</span>
                                            <span className="text-lg font-black text-emerald-500 lining-nums">{data.totalPlatesServed}</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Capacity</span>
                                            <span className="text-lg font-black text-blue-500 lining-nums">{data.totalPlatesEntitled}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {summaries.length === 0 && (
                            <div className="lg:col-span-3 text-center py-16 bg-slate-900/20 rounded-[2.5rem] border-2 border-dashed border-slate-800/50">
                                <p className="text-xs font-black text-slate-600 uppercase tracking-widest leading-relaxed"> No archived sessions found.<br />Summaries are captured automatically during reset.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Adjustment Modal */}
            {showAdjustment && selectedFamily && (
                <div
                    className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-4 animate-in fade-in duration-300"
                    onClick={() => setShowAdjustment(false)}
                >
                    <div
                        className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 w-full max-w-sm shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="font-black text-3xl mb-8 tracking-tighter text-center">Modify Inventory</h3>
                        <p className="text-center font-bold text-slate-500 text-sm mb-6 uppercase tracking-widest">{selectedFamily.surname}</p>

                        <div className="bg-slate-950 rounded-[2rem] p-8 border border-slate-800 mb-10 shadow-inner">
                            <div className="flex gap-6 justify-center items-center">
                                <button
                                    onClick={() => setAdjustmentValue(v => v - 1)}
                                    className="w-16 h-16 bg-slate-800 rounded-2xl text-2xl font-black text-slate-400 hover:bg-slate-700 transition"
                                >−</button>
                                <div className="w-20 text-center">
                                    <span className="text-5xl font-black text-white lining-nums">{adjustmentValue}</span>
                                </div>
                                <button
                                    onClick={() => setAdjustmentValue(v => v + 1)}
                                    className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-2xl text-2xl font-black hover:bg-emerald-500/20 transition"
                                >+</button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <input
                                value={adjReason}
                                onChange={e => setAdjReason(e.target.value)}
                                placeholder="Adjustment Reason…"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-4 text-sm font-bold mb-4 outline-none focus:border-emerald-500"
                            />
                            <button
                                onClick={handleAdjustment}
                                className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-black py-5 rounded-2xl transition-all shadow-2xl shadow-emerald-500/10 text-lg border-b-4 border-emerald-700 active:border-b-0"
                            >COMMIT CHANGE</button>
                            <button
                                onClick={() => setShowAdjustment(false)}
                                className="w-full text-slate-600 font-black py-2 hover:text-slate-400 transition-colors uppercase text-xs tracking-widest"
                            >DISCARD</button>
                        </div>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {selectedFamily && !showAdjustment && (
                <div
                    className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-4 animate-in fade-in duration-300"
                    onClick={() => setSelectedFamily(null)}
                >
                    <div
                        className="bg-slate-900 border border-slate-800 rounded-[2.5rem] w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                            <div className="flex flex-col">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Audit Trail</p>
                                <h3 className="font-black text-3xl tracking-tighter text-white">{selectedFamily.surname}</h3>
                            </div>
                            <button onClick={() => setSelectedFamily(null)} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white transition-colors">✕</button>
                        </div>
                        <div className="p-8 overflow-y-auto space-y-4">
                            {isHistoryLoading ? (
                                <div className="text-center py-20">
                                    <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
                                    <p className="text-xs font-black text-slate-600 uppercase tracking-widest">Reconstructing Logs…</p>
                                </div>
                            ) : history.map(h => (
                                <div key={h.id} className="p-5 bg-slate-950 rounded-2xl border border-slate-800/50 hover:border-slate-800 transition-colors">
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2 py-1 bg-slate-900 rounded border border-slate-800">
                                            {new Date(h.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                        </span>
                                        <span className={`text-[9px] font-black px-2 py-1 rounded uppercase tracking-widest ${h.action_type === 'SERVE' ? 'bg-emerald-500/10 text-emerald-500' :
                                            h.action_type === 'CHECK_IN' ? 'bg-blue-500/10 text-blue-500' :
                                                'bg-amber-500/10 text-amber-500'
                                            }`}>
                                            {h.action_type}
                                        </span>
                                    </div>
                                    <p className="text-slate-300 font-bold leading-relaxed">{h.details}</p>
                                    {h.station_id && <p className="text-[9px] font-black text-slate-600 mt-3 uppercase tracking-widest">Source: {h.station_id}</p>}
                                </div>
                            ))}
                            {!isHistoryLoading && history.length === 0 && (
                                <div className="text-center py-20 bg-slate-950 rounded-[2rem] border-2 border-dashed border-slate-800/50">
                                    <p className="text-xs font-black text-slate-600 uppercase tracking-widest">Zero Records Found</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* New Event Modal */}
            {showNewEventModal && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/98 backdrop-blur-2xl p-4 animate-in fade-in duration-300"
                    onClick={() => setShowNewEventModal(false)}
                >
                    <div
                        className="bg-slate-900 border border-slate-800 rounded-[3rem] p-12 w-full max-w-md shadow-2xl text-center"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-red-500/20">
                            <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h3 className="text-4xl font-black text-white mb-4 tracking-tighter">Initialize Event</h3>
                        <p className="text-sm text-slate-500 mb-10 leading-relaxed font-bold uppercase tracking-wide">
                            WARNING: Critical session modification. All existing check-ins will be archived under the new context.
                        </p>

                        <div className="space-y-8">
                            <div>
                                <label className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] mb-3 block">New Context Name</label>
                                <input
                                    type="text"
                                    value={newEventName}
                                    onChange={e => setNewEventName(e.target.value)}
                                    placeholder="CONTEXT-X-202X"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-5 text-white font-black text-xl text-center outline-none focus:border-emerald-500 transition-all shadow-inner uppercase tracking-widest"
                                />
                            </div>

                            <div className="flex flex-col gap-4">
                                <button
                                    onClick={handleStartNewEvent}
                                    disabled={!newEventName.trim()}
                                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-black py-6 rounded-2xl transition-all shadow-2xl shadow-emerald-500/20 active:scale-[0.98] disabled:opacity-50 text-xl"
                                >
                                    INITIALIZE SESSION
                                </button>
                                <button
                                    onClick={() => setShowNewEventModal(false)}
                                    className="w-full text-slate-600 font-black py-2 hover:text-slate-400 transition-colors uppercase text-xs tracking-widest"
                                >
                                    ABORT
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
