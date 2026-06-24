import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, FlaskConical, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../../services/api';
import type { LabAppRecord } from '../../types';

const CATEGORIES = ['recording', 'synthesis', 'composition', 'effects', 'other'] as const;

const SANDBOX_OPTIONS = [
  'allow-scripts',
  'allow-same-origin',
  'allow-downloads',
  'allow-forms',
  'allow-popups',
  'allow-modals',
];

const PERMISSION_OPTIONS = ['microphone', 'camera', 'midi', 'autoplay'];

const emptyForm = (): Partial<LabAppRecord> => ({
  name: '',
  description: '',
  src: '',
  category: 'other',
  author: '',
  sourceUrl: '',
  permissions: [],
  sandbox: ['allow-scripts'],
  allow: [],
  enabled: true,
});

export function AdminLabAppsPanel() {
  const [apps, setApps] = useState<LabAppRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LabAppRecord | null>(null);
  const [form, setForm] = useState<Partial<LabAppRecord>>(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LabAppRecord | null>(null);

  const load = async () => {
    try {
      const data = await API.getAdminLabApps();
      setApps(data);
    } catch {
      toast.error('Failed to load lab apps');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (app: LabAppRecord) => {
    setEditing(app);
    setForm({ ...app });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
  };

  const handleSave = async () => {
    if (!form.name || !form.src) {
      toast.error('Name and URL are required');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await API.updateLabApp(editing.id, form);
        toast.success('App updated');
      } else {
        await API.createLabApp(form);
        toast.success('App created');
      }
      await load();
      closeForm();
    } catch (e: any) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await API.deleteLabApp(deleteTarget.id);
      toast.success('App deleted');
      setDeleteTarget(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Delete failed');
    }
  };

  const toggleEnabled = async (app: LabAppRecord) => {
    try {
      await API.updateLabApp(app.id, { ...app, enabled: !app.enabled });
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Update failed');
    }
  };

  const toggleArrayItem = (field: 'permissions' | 'sandbox' | 'allow', value: string) => {
    const current = (form[field] as string[]) || [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setForm((f) => ({ ...f, [field]: next }));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12 opacity-40">
        <span className="loading loading-spinner loading-md" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <FlaskConical size={20} className="text-secondary" /> Lab Apps
        </h3>
        <button className="btn btn-sm btn-primary shadow-md" onClick={openCreate}>
          <Plus size={14} /> Add App
        </button>
      </div>

      {/* App list */}
      <div className="space-y-2">
        {apps.length === 0 && (
          <p className="text-sm opacity-40 text-center py-8">No lab apps yet.</p>
        )}
        {apps.map((app) => (
          <div
            key={app.id}
            className="flex items-center gap-3 p-3 bg-base-200 rounded-box border border-base-content/5"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm truncate">{app.name}</span>
                <span className="badge badge-xs badge-outline">{app.category}</span>
                {!app.enabled && <span className="badge badge-xs badge-warning">disabled</span>}
              </div>
              <p className="text-xs opacity-40 truncate">{app.src}</p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <a
                href={app.src}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-xs btn-square opacity-50 hover:opacity-100"
                title="Open app"
              >
                <ExternalLink size={12} />
              </a>
              <input
                type="checkbox"
                className="toggle toggle-xs toggle-success"
                checked={app.enabled}
                onChange={() => toggleEnabled(app)}
                title={app.enabled ? 'Disable' : 'Enable'}
              />
              <button
                className="btn btn-ghost btn-xs btn-square opacity-70 hover:opacity-100"
                onClick={() => openEdit(app)}
                title="Edit"
              >
                <Pencil size={13} />
              </button>
              <button
                className="btn btn-ghost btn-xs btn-square text-error opacity-70 hover:opacity-100"
                onClick={() => setDeleteTarget(app)}
                title="Delete"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-base-100 rounded-box shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h4 className="font-bold text-lg">{editing ? 'Edit Lab App' : 'Add Lab App'}</h4>

            <div className="form-control">
              <label className="label"><span className="label-text">Name *</span></label>
              <input
                className="input input-bordered input-sm"
                value={form.name || ''}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="My Audio Tool"
              />
            </div>

            <div className="form-control">
              <label className="label"><span className="label-text">URL (src) *</span></label>
              <input
                className="input input-bordered input-sm"
                value={form.src || ''}
                onChange={(e) => setForm((f) => ({ ...f, src: e.target.value }))}
                placeholder="https://example.com/tool"
              />
            </div>

            <div className="form-control">
              <label className="label"><span className="label-text">Description</span></label>
              <textarea
                className="textarea textarea-bordered textarea-sm"
                value={form.description || ''}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="form-control">
                <label className="label"><span className="label-text">Category</span></label>
                <select
                  className="select select-bordered select-sm"
                  value={form.category || 'other'}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as LabAppRecord['category'] }))}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="form-control">
                <label className="label"><span className="label-text">Author</span></label>
                <input
                  className="input input-bordered input-sm"
                  value={form.author || ''}
                  onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
                  placeholder="username"
                />
              </div>
            </div>

            <div className="form-control">
              <label className="label"><span className="label-text">Source URL (GitHub)</span></label>
              <input
                className="input input-bordered input-sm"
                value={form.sourceUrl || ''}
                onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))}
                placeholder="https://github.com/..."
              />
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">Sandbox permissions</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {SANDBOX_OPTIONS.map((opt) => (
                  <label key={opt} className="flex items-center gap-1 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={(form.sandbox || []).includes(opt)}
                      onChange={() => toggleArrayItem('sandbox', opt)}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">Feature permissions (allow)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {PERMISSION_OPTIONS.map((opt) => (
                  <label key={opt} className="flex items-center gap-1 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={(form.allow || []).includes(opt)}
                      onChange={() => toggleArrayItem('allow', opt)}
                    />
                    {opt}
                  </label>
                ))}
              </div>
              <div className="mt-1">
                <div className="flex flex-wrap gap-1">
                  {(form.allow || []).filter((v) => !PERMISSION_OPTIONS.includes(v)).map((v) => (
                    <span key={v} className="badge badge-xs">{v}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">Permissions info badges</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {PERMISSION_OPTIONS.map((opt) => (
                  <label key={opt} className="flex items-center gap-1 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs"
                      checked={(form.permissions || []).includes(opt)}
                      onChange={() => toggleArrayItem('permissions', opt)}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-control">
              <label className="label cursor-pointer">
                <span className="label-text">Enabled</span>
                <input
                  type="checkbox"
                  className="toggle toggle-sm toggle-success"
                  checked={form.enabled !== false}
                  onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                />
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                className="btn btn-primary btn-sm flex-1"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <span className="loading loading-spinner loading-xs" /> : null}
                {editing ? 'Save Changes' : 'Create App'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={closeForm}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-base-100 rounded-box shadow-xl p-6 space-y-4 w-full max-w-sm">
            <h4 className="font-bold text-lg">Delete "{deleteTarget.name}"?</h4>
            <p className="text-sm opacity-60">This action cannot be undone.</p>
            <div className="flex gap-2">
              <button className="btn btn-error btn-sm flex-1" onClick={handleDelete}>
                Delete
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
