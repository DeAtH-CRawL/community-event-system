'use client';

import { useState, useEffect, useMemo } from 'react';
import {
    getAllFamiliesWithStatus,
    adjustPlates,
    getAuditHistory,
    getEventStats,
    resetEvent,
    type Family,
    type AuditLogEntry,
} from '@/src/lib/actions';

const DEFAULT_EVENT = "Community Dinner 2024";

export default function AdminDashboard() {
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

    // Confirmation Modal
    const [confirmConfig, setConfirmConfig] = useState<{
        show: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({ show: false, title: '', message: '', onConfirm: () => { } });

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [familiesData, statsData] = await Promise.all([
                getAllFamiliesWithStatus(DEFAULT_EVENT),
                getEventStats(DEFAULT_EVENT),
            ]);
            setFamilies(Array.isArray(familiesData) ? familiesData : []);
            setStats(statsData);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Sync from Google Sheets
    const handleSync = async () => {
        setIsSyncing(true);
        setSyncResult(null);
        try {
            const response = await fetch('/api/sync-families', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await response.json();

            if (data.success) {
                setSyncResult({
                    success: true,
                    // "✓ Sync complete! Total: X Synced: Y Skipped: Z Errors: A"
                    message: `✓ Sync complete! Total: ${data.stats.total}, Synced: ${data.stats.synced}, Skipped: ${data.stats.skipped}, Errors: ${data.stats.errors}`
                });
                loadData();
            } else {
                setSyncResult({
                    success: false,
                    message: `⚠ Sync failed. ${data.errors?.length ? data.errors.join(', ') : 'Unknown error'}`
                });
                console.error('Sync errors:', data.errors);
            }
        } catch (err) {
            setSyncResult({ success: false, message: '✗ Sync failed. Check network connection.' });
            console.error('Sync exception:', err);
        } finally {
            setIsSyncing(false);
        }
    };

    // Reset event (clear all servings)
    const handleReset = () => {
        setConfirmConfig({
            show: true,
            title: 'Reset Event',
            message: `This will clear ALL check-ins and serving records for "${DEFAULT_EVENT}". This cannot be undone. Are you absolutely sure?`,
            onConfirm: async () => {
                try {
                    const result = await resetEvent({ eventName: DEFAULT_EVENT });
                    if (result.success) {
                        loadData();
                        window.alert(result.message);
                    } else {
                        window.alert(result.message);
                    }
                } catch (err) {
                    window.alert('Reset failed.');
                }
                setConfirmConfig(prev => ({ ...prev, show: false }));
            },
        });
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

    const handleOpenHistory = async (family: Family) => {
        setSelectedFamily(family);
        setHistory([]);
        setIsHistoryLoading(true);
        try {
            const data = await getAuditHistory(DEFAULT_EVENT, family.id);
            setHistory(data);
        } catch (err) {
            console.error(err);
        } finally {
            setIsHistoryLoading(false);
        }
    };

    const handleAdjustment = async () => {
        if (!selectedFamily || adjustmentValue === 0) return;
        try {
            const res = await adjustPlates({
                role: 'admin',
                eventName: DEFAULT_EVENT,
                familyId: selectedFamily.id,
                adjustment: adjustmentValue,
                reason: adjReason || `Admin adjustment: ${adjustmentValue > 0 ? '+' : ''}${adjustmentValue} plates.`,
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
            window.alert('Adjustment failed.');
        }
    };

    return (
        <main className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
                    <div>
                        <h1 className="text-4xl font-black tracking-tight text-white mb-1">Admin Panel</h1>
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Event: {DEFAULT_EVENT}</p>
                    </div>
                    <div className="flex gap-3 items-center flex-wrap">
                        {/* Sync from Sheet Button */}
                        <button
                            onClick={handleSync}
                            disabled={isSyncing}
                            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            {isSyncing ? (
                                <>
                                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    Syncing...
                                </>
                            ) : (
                                'Sync from Google Sheet'
                            )}
                        </button>
                        {/* Reset Button */}
                        <button
                            onClick={handleReset}
                            className="px-5 py-2.5 bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-red-600/30 transition-colors"
                        >
                            Reset Event
                        </button>
                        {/* Refresh Button */}
                        <button
                            onClick={loadData}
                            className="px-5 py-2.5 bg-slate-800 text-white rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-slate-700 transition-colors"
                        >
                            Refresh
                        </button>
                    </div>
                </header>

                {/* Sync Result Message */}
                {syncResult && (
                    <div className={`mb-6 p-4 rounded-lg border ${syncResult.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                        <p className="font-bold text-sm">{syncResult.message}</p>
                    </div>
                )}

                {/* Stats Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Total Families</p>
                        <p className="text-3xl font-bold text-white">{stats.totalFamilies}</p>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Checked In</p>
                        <p className="text-3xl font-bold text-emerald-400">{stats.familiesCheckedIn}</p>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Plates Entitled</p>
                        <p className="text-3xl font-bold text-blue-400">{stats.totalPlatesEntitled}</p>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Plates Served</p>
                        <p className="text-3xl font-bold text-purple-400">{stats.totalPlatesServed}</p>
                    </div>
                </div>

                {/* Search */}
                <div className="mb-8">
                    <input
                        type="text"
                        placeholder="Search by Family Name or Phone..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-base focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all shadow-sm"
                    />
                </div>

                {/* Families Table */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-800/50 border-b border-slate-800 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                                    <th className="py-4 px-6">ID</th>
                                    <th className="py-4 px-4">Family</th>
                                    <th className="py-4 px-4 text-center">Members</th>
                                    <th className="py-4 px-4 text-center">Plates</th>
                                    <th className="py-4 px-4 text-center">Status</th>
                                    <th className="py-4 px-6 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {filtered.map((f) => (
                                    <tr key={f.id} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="py-4 px-6">
                                            <span className="text-xs font-mono text-slate-500">{f.id}</span>
                                        </td>
                                        <td className="py-4 px-4">
                                            <p className="font-bold text-white leading-tight">{f.surname}</p>
                                            <p className="text-sm text-slate-500">{f.head_name}</p>
                                            <p className="text-xs text-slate-600 font-mono">{f.phone}</p>
                                        </td>
                                        <td className="py-4 px-4 text-center">
                                            <span className="text-lg font-bold text-slate-300">{f.family_size}</span>
                                        </td>
                                        <td className="py-4 px-4 text-center">
                                            <p className="font-bold text-lg text-emerald-400">
                                                {f.plates_remaining} <span className="text-xs text-slate-500 font-normal">/ {f.plates_entitled}</span>
                                            </p>
                                            <p className="text-[10px] text-slate-500">{f.plates_used} served</p>
                                        </td>
                                        <td className="py-4 px-4 text-center">
                                            {f.checked_in_at ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                                    Checked In
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border bg-slate-800 text-slate-400 border-slate-700">
                                                    Not Arrived
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-4 px-6 text-right space-x-1">
                                            {f.checked_in_at && (
                                                <button
                                                    onClick={() => { setSelectedFamily(f); setShowAdjustment(true); }}
                                                    className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-slate-700 hover:bg-slate-800 transition-all"
                                                >
                                                    Adjust
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleOpenHistory(f)}
                                                className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 transition-all"
                                            >
                                                History
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {isLoading && (
                    <p className="text-center py-12 text-sm font-bold text-slate-400 tracking-widest uppercase animate-pulse">
                        Loading...
                    </p>
                )}
                {!isLoading && filtered.length === 0 && (
                    <p className="text-center py-20 text-slate-400 font-bold">
                        {search ? `No families matching "${search}"` : 'No families in system. Click "Sync from Sheet" to import.'}
                    </p>
                )}
            </div>

            {/* History Modal */}
            {selectedFamily && !showAdjustment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
                        <div className="flex justify-between items-center p-6 border-b border-slate-800">
                            <div>
                                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Audit Trail</p>
                                <h2 className="text-xl font-bold text-white">{selectedFamily.surname} ({selectedFamily.id})</h2>
                            </div>
                            <button onClick={() => setSelectedFamily(null)} className="w-10 h-10 rounded-full hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {isHistoryLoading && <p className="text-slate-500 animate-pulse">Loading history...</p>}
                            {!isHistoryLoading && history.length === 0 && <p className="text-slate-500">No history recorded yet.</p>}
                            {history.map((log) => (
                                <div key={log.id} className="border-l-2 border-slate-800 pl-6 pb-2 relative">
                                    <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-slate-700" />
                                    <div className="flex justify-between items-center mb-1">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${log.action_type === 'CHECK_IN' ? 'bg-emerald-500/10 text-emerald-400' :
                                            log.action_type === 'SERVE' ? 'bg-blue-500/10 text-blue-400' :
                                                'bg-amber-500/10 text-amber-400'
                                            }`}>
                                            {log.action_type}
                                        </span>
                                        <span className="text-[10px] text-slate-500 font-mono">
                                            {new Date(log.created_at).toLocaleString()}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-300 mb-1">{log.details}</p>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                                        {log.actor_role} {log.station_id ? `@ ${log.station_id}` : ''}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Adjustment Modal */}
            {showAdjustment && selectedFamily && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-8">
                        <h2 className="text-xl font-bold text-white mb-1">Adjust Plates</h2>
                        <p className="text-xs text-slate-500 mb-8 font-bold uppercase tracking-wider">
                            {selectedFamily.surname} ({selectedFamily.id})
                        </p>

                        <div className="space-y-6 mb-8">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-wider text-center">
                                    Adjustment (+/-)
                                </label>
                                <div className="flex items-center gap-4">
                                    <button onClick={() => setAdjustmentValue(v => v - 1)} className="w-12 h-12 flex items-center justify-center bg-slate-800 rounded-xl text-xl font-bold hover:bg-slate-700 active:scale-95 transition-all">-</button>
                                    <input
                                        type="number"
                                        value={adjustmentValue}
                                        onChange={(e) => setAdjustmentValue(Number(e.target.value))}
                                        className="flex-1 bg-slate-950 text-center text-3xl font-bold py-2 rounded-xl border border-slate-800 focus:border-emerald-500 outline-none font-mono"
                                    />
                                    <button onClick={() => setAdjustmentValue(v => v + 1)} className="w-12 h-12 flex items-center justify-center bg-emerald-500 text-white rounded-xl text-xl font-bold hover:bg-emerald-600 active:scale-95 transition-all">+</button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-wider">Reason (for audit)</label>
                                <textarea
                                    value={adjReason}
                                    onChange={(e) => setAdjReason(e.target.value)}
                                    placeholder="e.g., Correction, Guest added..."
                                    className="w-full bg-slate-950 rounded-xl p-4 text-sm border border-slate-800 focus:border-emerald-500 outline-none h-24 resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <button onClick={handleAdjustment} className="w-full py-4 font-bold bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 active:scale-95 transition-all">
                                Apply Adjustment
                            </button>
                            <button onClick={() => setShowAdjustment(false)} className="w-full py-2 text-sm font-bold text-slate-500 hover:text-slate-300 transition-colors">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmConfig.show && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-xl shadow-2xl p-6">
                        <h3 className="text-xl font-bold text-white mb-2">{confirmConfig.title}</h3>
                        <p className="text-sm text-slate-400 mb-8">{confirmConfig.message}</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setConfirmConfig(prev => ({ ...prev, show: false }))}
                                className="flex-1 py-3 px-4 rounded border border-slate-700 font-bold text-sm text-slate-400 hover:bg-slate-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmConfig.onConfirm}
                                className="flex-1 py-3 px-4 rounded bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
