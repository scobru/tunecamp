import { Command } from "cmdk";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home, Music, Library, Search, User, ListMusic } from "lucide-react";

export const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] pb-[20vh] bg-black/50 backdrop-blur-sm transition-opacity"
    >
      <div className="w-[90vw] max-w-xl bg-base-200 rounded-xl shadow-2xl border border-base-content/10 overflow-hidden flex flex-col cmdk-root">
        <Command.Input 
          className="w-full bg-transparent p-4 text-lg outline-none border-b border-base-content/5 focus:ring-0 placeholder-opacity-50" 
          placeholder="Type a command or search (e.g. Navigation)..." 
        />
        <Command.List className="overflow-y-auto max-h-[50vh] p-2 space-y-1">
          <Command.Empty className="py-6 text-center text-sm opacity-50">No results found.</Command.Empty>

          <Command.Group heading="Navigation" className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:opacity-50 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-item]]:cursor-pointer [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2 [&_[cmdk-item]]:rounded-lg aria-selected:[&_[cmdk-item]]:bg-base-300">
            <Command.Item onSelect={() => runCommand(() => navigate("/"))} className="flex items-center gap-3">
              <Home size={18} className="opacity-70" /> Home
            </Command.Item>
            <Command.Item onSelect={() => runCommand(() => navigate("/search"))} className="flex items-center gap-3">
              <Search size={18} className="opacity-70" /> Search
            </Command.Item>
            <Command.Item onSelect={() => runCommand(() => navigate("/albums"))} className="flex items-center gap-3">
              <Library size={18} className="opacity-70" /> Explore Albums
            </Command.Item>
            <Command.Item onSelect={() => runCommand(() => navigate("/artists"))} className="flex items-center gap-3">
              <Music size={18} className="opacity-70" /> Explore Artists
            </Command.Item>
            <Command.Item onSelect={() => runCommand(() => navigate("/playlists"))} className="flex items-center gap-3">
              <ListMusic size={18} className="opacity-70" /> Playlists
            </Command.Item>
            <Command.Item onSelect={() => runCommand(() => navigate("/profile"))} className="flex items-center gap-3">
              <User size={18} className="opacity-70" /> My Profile
            </Command.Item>
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  );
};

