import { useState, useEffect, useRef } from "react";
import { Tag, Plus, X, Check, Loader } from "lucide-react";
import { notify } from "../utils/notify";
import { GENRES, normalizeGenre } from "../constants/genres";

interface GenreTagsProps {
  genres: string | null | undefined;
  canEdit?: boolean;
  onSave: (genre: string) => Promise<void>;
  size?: "sm" | "md";
}

export const GenreTags = ({ genres, canEdit = false, onSave, size = "md" }: GenreTagsProps) => {
  const [tags, setTags] = useState<string[]>(() =>
    genres ? genres.split(",").map(g => g.trim()).filter(Boolean) : []
  );
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTags(genres ? genres.split(",").map(g => g.trim()).filter(Boolean) : []);
  }, [genres]);

  const save = async (nextTags: string[]) => {
    setSaving(true);
    try {
      await onSave(nextTags.join(", "));
      setTags(nextTags);
    } catch (err) {
      notify.error(err, "Failed to update genre");
    } finally {
      setSaving(false);
    }
  };

  const removeTag = (tag: string) => save(tags.filter(t => t !== tag));

  const addTag = () => {
    const val = input.trim();
    if (!val) { setAdding(false); setInput(""); return; }
    const canonical = normalizeGenre(val) ?? val;
    if (tags.includes(canonical)) { setAdding(false); setInput(""); return; }
    save([...tags, canonical]);
    setAdding(false);
    setInput("");
  };

  const badgeSize = size === "sm"
    ? "badge badge-sm badge-ghost text-[11px] font-bold"
    : "badge badge-ghost text-xs font-bold tracking-wide";

  if (!tags.length && !canEdit) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tag size={size === "sm" ? 10 : 12} className="opacity-30 shrink-0" />

      {tags.map(tag => (
        <span key={tag} className={`${badgeSize} gap-1 group/tag`}>
          {tag}
          {canEdit && !saving && (
            <button
              onClick={() => removeTag(tag)}
              className="opacity-0 group-hover/tag:opacity-60 hover:!opacity-100 transition-opacity"
              aria-label={`Remove ${tag}`}
            >
              <X size={9} />
            </button>
          )}
        </span>
      ))}

      {saving && <Loader size={12} className="opacity-40 animate-spin" />}

      {canEdit && !saving && (
        adding ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addTag(); if (e.key === "Escape") { setAdding(false); setInput(""); } }}
              onBlur={() => { if (!input.trim()) { setAdding(false); } }}
              list="genre-tags-list"
              placeholder="e.g. Electronic"
              className="input input-xs w-32 rounded-lg border border-base-content/20 bg-base-200/50 text-xs focus:outline-none focus:border-primary/50"
              autoFocus
            />
            <datalist id="genre-tags-list">
              {GENRES.filter(s => !tags.includes(s)).map(s => <option key={s} value={s} />)}
            </datalist>
            <button onClick={addTag} className="btn btn-xs btn-circle btn-ghost text-success" aria-label="Confirm">
              <Check size={11} />
            </button>
            <button onClick={() => { setAdding(false); setInput(""); }} className="btn btn-xs btn-circle btn-ghost opacity-40" aria-label="Cancel">
              <X size={11} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setAdding(true); setTimeout(() => inputRef.current?.focus(), 50); }}
            className="badge badge-ghost badge-sm opacity-30 hover:opacity-70 transition-opacity cursor-pointer gap-1 text-[11px]"
            aria-label="Add genre"
          >
            <Plus size={9} /> genre
          </button>
        )
      )}
    </div>
  );
};
