import { useState, useEffect } from 'react';
import { Calendar, MapPin, Ticket, Plus, Trash2, Edit, Send, X } from 'lucide-react';
import API from '../../services/api';
import { useAuthStore } from '../../stores/useAuthStore';
import type { ArtistEvent, ArtistEventInput } from '../../types';
import { notify } from '../../utils/notify';

const emptyForm: ArtistEventInput = {
    title: '',
    event_date: '',
    venue: '',
    city: '',
    country: '',
    ticket_url: '',
    description: '',
};

export const ArtistEventsManager = () => {
    const { adminUser, user, role } = useAuthStore();
    const [events, setEvents] = useState<ArtistEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState<ArtistEventInput>(emptyForm);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [announce, setAnnounce] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);

    const isRoot = !!(user?.isRootAdmin || role === 'root_admin');
    const rawArtistId = adminUser?.artistId ?? user?.artistId;
    const validRaw = rawArtistId && rawArtistId !== 'null' && rawArtistId !== 'undefined' && rawArtistId !== '0';
    const artistId: string | undefined = validRaw ? String(rawArtistId) : (isRoot ? '-1' : undefined);

    useEffect(() => {
        if (artistId) loadEvents(artistId);
    }, [artistId]);

    const loadEvents = async (id: string) => {
        setLoading(true);
        try {
            const data = await API.getArtistEvents(id);
            setEvents(data);
        } catch (e) {
            console.error('Failed to load events', e);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setForm(emptyForm);
        setEditingId(null);
        setShowForm(false);
    };

    const startEdit = (ev: ArtistEvent) => {
        setForm({
            title: ev.title,
            event_date: ev.event_date.slice(0, 10),
            venue: ev.venue || '',
            city: ev.city || '',
            country: ev.country || '',
            ticket_url: ev.ticket_url || '',
            description: ev.description || '',
        });
        setEditingId(ev.id);
        setShowForm(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!artistId || !form.title.trim() || !form.event_date) return;
        setSaving(true);
        try {
            if (editingId) {
                await API.updateArtistEvent(artistId, editingId, form);
                notify.success('Event updated');
            } else {
                await API.createArtistEvent(artistId, { ...form, announce });
                notify.success(announce ? 'Event created and announced to the Fediverse' : 'Event created');
            }
            resetForm();
            await loadEvents(artistId);
        } catch (err: any) {
            console.error(err);
            notify.error(err, 'Failed to save event');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (ev: ArtistEvent) => {
        if (!artistId) return;
        if (!confirm(`Delete event "${ev.title}"?`)) return;
        try {
            await API.deleteArtistEvent(artistId, ev.id);
            setEvents(prev => prev.filter(e => e.id !== ev.id));
        } catch (err: any) {
            console.error(err);
            notify.error(err, 'Failed to delete event');
        }
    };

    if (!artistId) {
        return (
            <div className="text-center py-12 opacity-50">
                <Calendar className="mx-auto mb-2 opacity-50" />
                <p>No artist profile associated with this account.</p>
            </div>
        );
    }

    const isPast = (d: string) => new Date(d) < new Date(new Date().toDateString());

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between pb-2">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Live Events</h2>
                    <p className="opacity-60 text-sm">Announce your upcoming shows. They appear on your artist page and can be broadcast to the Fediverse.</p>
                </div>
                {!showForm && (
                    <button className="btn btn-primary gap-2" onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }}>
                        <Plus size={18} /> New Event
                    </button>
                )}
            </div>

            {/* Create / Edit form */}
            {showForm && (
                <form onSubmit={handleSubmit} className="card-m3 border border-base-content/5 bg-base-200/40 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold">{editingId ? 'Edit Event' : 'New Event'}</h3>
                        <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={resetForm}><X size={18} /></button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label className="form-control sm:col-span-2">
                            <span className="label-text text-xs font-semibold opacity-70 mb-1">Event title *</span>
                            <input
                                type="text" required
                                className="input input-bordered w-full"
                                placeholder="e.g. Summer Tour 2026 — Live in Rome"
                                value={form.title}
                                onChange={e => setForm({ ...form, title: e.target.value })}
                            />
                        </label>
                        <label className="form-control">
                            <span className="label-text text-xs font-semibold opacity-70 mb-1">Date *</span>
                            <input
                                type="date" required
                                className="input input-bordered w-full"
                                value={form.event_date}
                                onChange={e => setForm({ ...form, event_date: e.target.value })}
                            />
                        </label>
                        <label className="form-control">
                            <span className="label-text text-xs font-semibold opacity-70 mb-1">Venue</span>
                            <input
                                type="text"
                                className="input input-bordered w-full"
                                placeholder="e.g. Atlantico Live"
                                value={form.venue || ''}
                                onChange={e => setForm({ ...form, venue: e.target.value })}
                            />
                        </label>
                        <label className="form-control">
                            <span className="label-text text-xs font-semibold opacity-70 mb-1">City</span>
                            <input
                                type="text"
                                className="input input-bordered w-full"
                                placeholder="e.g. Roma"
                                value={form.city || ''}
                                onChange={e => setForm({ ...form, city: e.target.value })}
                            />
                        </label>
                        <label className="form-control">
                            <span className="label-text text-xs font-semibold opacity-70 mb-1">Country</span>
                            <input
                                type="text"
                                className="input input-bordered w-full"
                                placeholder="e.g. Italy"
                                value={form.country || ''}
                                onChange={e => setForm({ ...form, country: e.target.value })}
                            />
                        </label>
                        <label className="form-control sm:col-span-2">
                            <span className="label-text text-xs font-semibold opacity-70 mb-1">Ticket URL</span>
                            <input
                                type="url"
                                className="input input-bordered w-full"
                                placeholder="https://..."
                                value={form.ticket_url || ''}
                                onChange={e => setForm({ ...form, ticket_url: e.target.value })}
                            />
                        </label>
                        <label className="form-control sm:col-span-2">
                            <span className="label-text text-xs font-semibold opacity-70 mb-1">Description</span>
                            <textarea
                                className="textarea textarea-bordered w-full"
                                rows={3}
                                placeholder="Line-up, support acts, doors time…"
                                value={form.description || ''}
                                onChange={e => setForm({ ...form, description: e.target.value })}
                            />
                        </label>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-base-content/5">
                        {!editingId ? (
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <input type="checkbox" className="checkbox checkbox-sm checkbox-primary" checked={announce} onChange={e => setAnnounce(e.target.checked)} />
                                <Send size={14} /> Announce to the Fediverse
                            </label>
                        ) : <span className="text-xs opacity-50">Editing does not re-broadcast the announcement.</span>}
                        <div className="flex gap-2">
                            <button type="button" className="btn btn-ghost btn-sm" onClick={resetForm}>Cancel</button>
                            <button type="submit" className="btn btn-primary btn-sm gap-2" disabled={saving || !form.title.trim() || !form.event_date}>
                                {saving ? <span className="loading loading-spinner loading-xs" /> : <Plus size={14} />}
                                {editingId ? 'Save Changes' : 'Create Event'}
                            </button>
                        </div>
                    </div>
                </form>
            )}

            {/* Events list */}
            {loading && events.length === 0 ? (
                <div className="flex justify-center py-12"><span className="loading loading-spinner loading-lg opacity-40" /></div>
            ) : events.length === 0 ? (
                <div className="text-center py-16 opacity-50 border-2 border-dashed border-base-content/5 rounded-2xl">
                    <Calendar className="mx-auto mb-3 opacity-60" size={32} />
                    <p>No events yet. Add your next show to let fans know.</p>
                </div>
            ) : (
                <div className="grid gap-3">
                    {events.map(ev => {
                        const d = new Date(ev.event_date);
                        const where = [ev.venue, ev.city, ev.country].filter(Boolean).join(', ');
                        const past = isPast(ev.event_date);
                        return (
                            <div key={ev.id} className={`flex items-center gap-4 p-4 rounded-xl bg-base-200/40 border border-base-content/5 ${past ? 'opacity-50' : ''}`}>
                                <div className="flex flex-col items-center justify-center shrink-0 w-16 h-16 rounded-lg bg-primary/10 text-primary">
                                    <span className="text-xs font-bold uppercase">{d.toLocaleDateString(undefined, { month: 'short' })}</span>
                                    <span className="text-2xl font-black leading-none">{d.getDate()}</span>
                                    <span className="text-[10px] opacity-70">{d.getFullYear()}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold truncate">{ev.title} {past && <span className="text-xs font-normal opacity-60">(past)</span>}</h3>
                                    {where && <p className="text-sm opacity-60 flex items-center gap-1 truncate"><MapPin size={13} /> {where}</p>}
                                    {ev.ticket_url && <p className="text-xs opacity-50 flex items-center gap-1 truncate"><Ticket size={12} /> {ev.ticket_url}</p>}
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    <button className="btn btn-ghost btn-sm btn-circle" onClick={() => startEdit(ev)} title="Edit"><Edit size={16} /></button>
                                    <button className="btn btn-ghost btn-sm btn-circle text-error" onClick={() => handleDelete(ev)} title="Delete"><Trash2 size={16} /></button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
