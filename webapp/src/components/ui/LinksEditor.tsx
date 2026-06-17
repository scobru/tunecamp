import { Plus, Trash2 } from "lucide-react";

interface LinkItem {
  platform: string;
  url: string;
}

interface LinksEditorProps {
  links: LinkItem[];
  onChange: (links: LinkItem[]) => void;
  label?: string;
  placeholder?: string;
}

const PLATFORMS = [
  "Website",
  "X",
  "Instagram",
  "YouTube",
  "Facebook",
  "SoundCloud",
  "Bandcamp",
  "Other"
];

export const LinksEditor = ({ links, onChange, label, placeholder = "https://..." }: LinksEditorProps) => {
  const handleAddLink = () => {
    onChange([...links, { platform: "Website", url: "" }]);
  };

  const handleRemoveLink = (index: number) => {
    onChange(links.filter((_, i) => i !== index));
  };

  const handleUpdateLink = (index: number, key: keyof LinkItem, value: string) => {
    const updated = links.map((link, i) => {
      if (i === index) {
        const newLink = { ...link, [key]: value };
        // Proactive auto-detection of platform if URL changes and platform is Website/Other
        if (key === "url" && (link.platform === "Website" || link.platform === "Other" || link.platform === "")) {
          const lowerUrl = value.toLowerCase();
          if (lowerUrl.includes("twitter.com") || lowerUrl.includes("x.com")) newLink.platform = "X";
          else if (lowerUrl.includes("instagram.com")) newLink.platform = "Instagram";
          else if (lowerUrl.includes("youtube.com") || lowerUrl.includes("youtu.be")) newLink.platform = "YouTube";
          else if (lowerUrl.includes("facebook.com")) newLink.platform = "Facebook";
          else if (lowerUrl.includes("soundcloud.com")) newLink.platform = "SoundCloud";
          else if (lowerUrl.includes("bandcamp.com")) newLink.platform = "Bandcamp";
        }
        return newLink;
      }
      return link;
    });
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      {label && (
        <label className="label py-0">
          <span className="label-text font-semibold opacity-75">{label}</span>
        </label>
      )}
      
      {links.length === 0 ? (
        <div className="text-xs opacity-50 py-4 text-center border border-dashed border-base-content/20 rounded-xl bg-base-300/10">
          No links added yet. Click "+ Add Link" to get started.
        </div>
      ) : (
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {links.map((link, index) => (
            <div key={index} className="flex items-center gap-2 animate-in fade-in-50 duration-200">
              <select
                className="select select-sm select-bordered w-32 shrink-0 font-medium bg-base-200"
                value={link.platform || "Website"}
                onChange={(e) => handleUpdateLink(index, "platform", e.target.value)}
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              
              <input
                type="url"
                className="input input-sm input-bordered flex-1 min-w-0"
                placeholder={placeholder}
                value={link.url}
                onChange={(e) => handleUpdateLink(index, "url", e.target.value)}
              />
              
              <button
                type="button"
                className="btn btn-sm btn-ghost btn-square text-error hover:bg-error/10 hover:text-error shrink-0"
                onClick={() => handleRemoveLink(index)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      
      <button
        type="button"
        className="btn btn-sm btn-outline btn-primary gap-1 w-full sm:w-auto mt-1"
        onClick={handleAddLink}
      >
        <Plus size={16} /> Add Link
      </button>
    </div>
  );
};
