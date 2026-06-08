import { useUIStore } from "../../stores/useUIStore";
import type { Theme } from "../../stores/useUIStore";
import { Check } from "lucide-react";
import clsx from "clsx";

export const ThemeSwitcher = () => {
  const { theme, setTheme } = useUIStore();

  const themes: { id: Theme; label: string; color: string; bg: string }[] = [
    { id: "tunecamp", label: "Dark", color: "bg-[#1A1A1A]", bg: "bg-[#1A1A1A]" },
    { id: "grey", label: "Grey", color: "bg-[#666666]", bg: "bg-[#666666]" },
    { id: "light", label: "White", color: "bg-[#FFFFFF]", bg: "bg-[#FFFFFF]" },
    { id: "nordic", label: "Nordic", color: "bg-[#A5C9D7]", bg: "bg-[#A5C9D7]" },
  ];

  return (
    <div className="flex items-center gap-2 p-1 bg-base-300/30 rounded-full border border-base-content/5 w-fit">
      {themes.map((t) => (
        <button
          key={t.id}
          onClick={() => setTheme(t.id)}
          className={clsx(
            "w-6 h-6 rounded-full flex items-center justify-center transition-all hover:scale-110 relative group",
            t.color,
            t.id === "light" && "border border-black/10",
            theme === t.id ? "ring-2 ring-primary ring-offset-2 ring-offset-base-100" : "opacity-60 hover:opacity-100"
          )}
          title={t.label}
        >
          {theme === t.id && (
            <Check size={12} className={clsx(
                t.id === "light" || t.id === "nordic" ? "text-black" : "text-white"
            )} />
          )}
          <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-base-300 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-base-content/5">
            {t.label}
          </span>
        </button>
      ))}
    </div>
  );
};

