'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
    getAllFamiliesWithStatus,
    adjustPlates,
    getAuditHistory,
    getEventStats,
    resetEvent,
    getDistinctEventNames,
    type Family,
    type AuditLogEntry,
} from '@/src/lib/actions';

const DEFAULT_EVENT = "Community Dinner 2024";

// Client-side Supabase for Realtime
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminDashboard() {
    const [eventName, setEventName] = useState(DEFAULT_EVENT);
    const [eventList, setEventList] = useState<string[]>([DEFAULT_EVENT]);
    const [families, setFamilies] = useState<Family[]>([]);
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [stats, setStats] = useState({ totalFamilies: 0, familiesCheckedIn: 0, totalPlatesEntitled: 0, totalPlatesServed: 0 });

    // Sync state
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);

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

    const loadData = async (targetEvent?: string) => {
        const eventToLoad = targetEvent || eventName;
        // Silent update if just refreshing data
        try {
            const [familiesData, statsData, events] = await Promise.all([
                getAllFamiliesWithStatus(eventToLoad),
                getEventStats(eventToLoad),
                getDistinctEventNames(),
            ]);
            setFamilies(Array.isArray(familiesData) ? familiesData : []);
            setStats(statsData);
            if (events.length > 0) setEventList(events);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        const savedEvent = localStorage.getItem('current_event_name');
        if (savedEvent) setEventName(savedEvent);

        setIsLoading(true);
        loadData(savedEvent || DEFAULT_EVENT).finally(() => setIsLoading(false));

        // Real-time Subscription
        const channel = supabase.channel('admin-live')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'servings',
                    filter: `event_name=eq.${savedEvent || DEFAULT_EVENT}`
                },
                () => {
                    loadData(savedEvent || DEFAULT_EVENT);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Re-subscribe when eventName changes
    useEffect(() => {
        const channel = supabase.channel('admin-live-vent')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'servings',
                    filter: `event_name=eq.${eventName}`
                },
                () => {
                    loadData(eventName);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [eventName]);

    const handleSwitchEvent = (name: string) => {
        setEventName(name);
        localStorage.setItem('current_event_name', name);
        loadData(name);
    };

    const handleStartNewEvent = async () => {
        if (!newEventName.trim()) return;
        const name = newEventName.trim();
        setEventName(name);
        localStorage.setItem('current_event_name', name);
        setShowNewEventModal(false);
        setNewEventName('');
        await loadData(name);
    };

    const handleReset = async () => {
        if (!window.confirm(`CRITICAL: This will PERMANENTLY DELETE all check-ins and servings for "${eventName}". Are you sure?`)) {
            return;
        }

        try {
            const res = await resetEvent({ eventName: eventName });
            if (res.success) {
                window.alert("Event reset! All check-ins and plates cleared for this event.");
                loadData();
            } else {
                alert(res.message);
            }
        } catch (err) {
            alert("Failed to reset.");
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        setSyncResult(null);
        try {
            const response = await fetch('/api/sync-families', { method: 'POST' });
            const data = await response.json();
            if (data.success) {
                setSyncResult({ success: true, message: `Sync Complete: ${data.stats.synced} updated.` });
                loadData();
            } else {
                setSyncResult({ success: false, message: 'Sync Failed.' });
            }
        } catch (err) {
            setSyncResult({ success: false, message: 'Network Error.' });
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
                familyId: selectedFamily.id,
                adjustment: adjustmentValue,
                reason: adjReason || `Admin Adjustment: ${adjustmentValue}`,
            });
            if (res.success) {
                setShowAdjustment(false);
                setAdjustmentValue(0);
                setAdjReason('');
                loadData();
            } else {
                alert(res.message);
            }
        } catch (err) {
            alert('Failed.');
        }
    };

    const handleOpenHistory = async (f: Family) => {
        setSelectedFamily(f);
        setHistory([]);
        setIsHistoryLoading(true);
        try {
            const data = await getAuditHistory(eventName, f.id);
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
        <main className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <header className="mb-0">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                        <div>
                            <h1 className="text-4xl font-black text-white tracking-tight">Admin Dashboard</h1>
                            <div className="mt-2 flex items-center gap-2">
                                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">
                                    Current Event: <span className="text-emerald-400">{eventName}</span>
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex flex-col">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 ml-1">Switch Event</label>
                                <select
                                    value={eventName}
                                    onChange={(e) => handleSwitchEvent(e.target.value)}
                                    className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-sm font-bold text-slate-300 outline-none focus:border-emerald-500 min-w-[200px]"
                                >
                                    {eventList.map(e => <option key={e} value={e}>{e}</option>)}
                                </select>
                            </div>

                            <div className="h-10 w-[1px] bg-slate-800 mx-2 hidden md:block"></div>

                            <button
                                onClick={() => setShowNewEventModal(true)}
                                className="bg-red-600 hover:bg-red-500 text-white px-6 py-2.5 rounded-lg text-sm font-black uppercase tracking-wider transition-all shadow-lg shadow-red-900/20 active:scale-95 flex flex-col items-center leading-tight"
                            >
                                <span className="text-[10px] opacity-80">Reset / Start</span>
                                <span>New Event</span>
                            </button>

                            <button onClick={handleSync} disabled={isSyncing} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm font-black uppercase tracking-wider transition-all disabled:opacity-50 h-[44px]">
                                {isSyncing ? 'Syncing...' : 'Sync Data'}
                            </button>
                        </div>
                    </div>

                    {syncResult && (
                        <div className={`mb-6 p-4 rounded-xl border ${syncResult.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'} text-xs font-bold`}>
                            {syncResult.message}
                        </div>
                    )}
                </header>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Checked In (Families)</p>
                        <p className="text-3xl font-bold text-emerald-400">{stats.familiesCheckedIn} <span className="text-sm text-slate-600 font-normal">/ {stats.totalFamilies}</span></p>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Total Entitled Plates</p>
                        <p className="text-3xl font-bold text-blue-400">{stats.totalPlatesEntitled}</p>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Plates Served</p>
                        <p className="text-3xl font-bold text-purple-400">{stats.totalPlatesServed}</p>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Remaining Stock</p>
                        <p className="text-3xl font-bold text-white">{stats.totalPlatesEntitled - stats.totalPlatesServed}</p>
                    </div>
                </div>

                {/* Search */}
                <div className="mb-6">
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search..."
                        className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-sm focus:border-emerald-500 outline-none transition-colors"
                    />
                </div>

                {/* Table */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-800/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                            <tr>
                                <th className="p-4">Family</th>
                                <th className="p-4 text-center">Entitlement</th>
                                <th className="p-4 text-center">Remaining</th>
                                <th className="p-4 text-center">Status</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {filtered.map(f => (
                                <tr key={f.id} className="hover:bg-slate-800/30">
                                    <td className="p-4">
                                        <p className="font-bold text-white">{f.surname}</p>
                                        <p className="text-xs text-slate-500">{f.head_name}</p>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className="font-bold text-slate-300">{f.plates_entitled}</span>
                                        <div className="text-[10px] text-slate-600">
                                            Size: {f.family_size}
                                            {f.guests > 0 && <span className="text-emerald-500 font-bold"> +{f.guests} G</span>}
                                        </div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className={`font-bold ${f.plates_remaining === 0 && f.checked_in_at ? 'text-red-500' : 'text-emerald-400'}`}>
                                            {f.plates_remaining}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        {f.checked_in_at ? (
                                            <span className="inline-block w-2.5 h-2.5 bg-emerald-500 rounded-full"></span>
                                        ) : (
                                            <span className="inline-block w-2.5 h-2.5 bg-slate-700 rounded-full"></span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        {f.checked_in_at && (
                                            <button
                                                onClick={() => { setSelectedFamily(f); setShowAdjustment(true); }}
                                                className="text-xs font-bold uppercase text-slate-500 hover:text-white mr-3 transition-colors"
                                            >
                                                Adjust
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleOpenHistory(f)}
                                            className="text-xs font-bold uppercase text-blue-500 hover:text-blue-400 transition-colors"
                                        >
                                            Log
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Adjustment Modal */}
            {showAdjustment && selectedFamily && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm">
                        <h3 className="font-bold text-lg mb-4">Adjust: {selectedFamily.surname}</h3>
                        <div className="flex gap-4 justify-center mb-6">
                            <button onClick={() => setAdjustmentValue(v => v - 1)} className="w-12 h-12 bg-slate-800 rounded-xl text-xl font-bold hover:bg-slate-700">-</button>
                            <input type="number" value={adjustmentValue} onChange={e => setAdjustmentValue(Number(e.target.value))} className="w-20 text-center bg-transparent text-2xl font-bold border-b border-slate-700" />
                            <button onClick={() => setAdjustmentValue(v => v + 1)} className="w-12 h-12 bg-emerald-500/20 text-emerald-500 rounded-xl text-xl font-bold hover:bg-emerald-500/30">+</button>
                        </div>
                        <button onClick={handleAdjustment} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl mb-2">Confirm Adjustment</button>
                        <button onClick={() => setShowAdjustment(false)} className="w-full text-slate-500 font-bold py-2 hover:text-white">Cancel</button>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {selectedFamily && !showAdjustment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
                        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                            <h3 className="font-bold">Audit Log: {selectedFamily.surname}</h3>
                            <button onClick={() => setSelectedFamily(null)} className="text-slate-500 hover:text-white">✕</button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4">
                            {isHistoryLoading ? <p className="text-center text-slate-500">Loading...</p> : history.map(h => (
                                <div key={h.id} className="text-sm">
                                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                                        <span>{new Date(h.created_at).toLocaleString()}</span>
                                        <span className="uppercase font-bold">{h.action_type}</span>
                                    </div>
                                    <p className="text-slate-300">{h.details}</p>
                                </div>
                            ))}
                            {!isHistoryLoading && history.length === 0 && <p className="text-center text-slate-500">No events.</p>}
                        </div>
                    </div>
                </div>
            )}
            {/* New Event Modal */}
            {showNewEventModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl">
                        <h3 className="text-2xl font-black text-white mb-2">New Event</h3>
                        <p className="text-sm text-slate-400 mb-8 leading-relaxed">
                            Starting a new event will switch the app to a clean state. You can also <button onClick={handleReset} className="text-red-400 font-bold underline">Reset "{eventName}"</button> to clear all its data.
                        </p>

                        <div className="space-y-6">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Event Name</label>
                                <input
                                    type="text"
                                    value={newEventName}
                                    onChange={e => setNewEventName(e.target.value)}
                                    placeholder="e.g. Wedding Dinner 2024"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-4 text-white font-bold text-lg outline-none focus:border-emerald-500 transition-all"
                                />
                            </div>

                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={handleStartNewEvent}
                                    disabled={!newEventName.trim()}
                                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-black py-4 rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50"
                                >
                                    Start This Event
                                </button>
                                <button
                                    onClick={() => setShowNewEventModal(false)}
                                    className="w-full text-slate-500 font-bold py-2 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
