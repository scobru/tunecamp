import { Link } from "react-router-dom";
import {
  BookOpen,
  Crown,
  Shield,
  Sparkles,
  Headphones,
  Mic2,
  Upload,
  ShoppingBag,
  ListMusic,
  Globe,
  Radio,
  Heart,
  Check,
  X,
} from "lucide-react";
import { PageHeader } from "../components/ui/PageHeader";

/**
 * Newcomer-facing guide: a short explanation of what TuneCamp is, the roles
 * that exist and what each one can do, and an overview of the main sections.
 *
 * The role descriptions mirror docs/ROLES.md and the real permission model
 * (VisibilityGuardian.canPublishContent / utils/permissions.ts). Keep in sync.
 */

type RoleCard = {
  name: string;
  tagline: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string; // tailwind text color class
  badge: string; // badge bg/text/border classes (mirror Sidebar)
  bullets: string[];
};

const ROLES: RoleCard[] = [
  {
    name: "Listener",
    tagline: "The default account — here to enjoy the music.",
    icon: Headphones,
    color: "text-base-content/70",
    badge: "bg-base-content/5 text-base-content/60 border-base-content/10",
    bullets: [
      "Stream the catalog from the web player or any Subsonic-compatible app.",
      "Buy releases and store items, and manage your favorites.",
      "Build playlists, comment, follow artists, and personalize your profile.",
      "Cannot upload or sell — publishing is reserved to artists & staff.",
    ],
  },
  {
    name: "Artist",
    tagline: "A Listener (or Curator) linked to an artist profile.",
    icon: Mic2,
    color: "text-accent",
    badge: "bg-accent/10 text-accent border-accent/20",
    bullets: [
      "Everything a Listener can do, plus the Studio section.",
      "Upload tracks, create releases, and manage your own catalog.",
      "Publish social posts to the federated network (ActivityPub).",
      "Selling is unlocked per-artist by staff via the “Sales enabled” flag.",
    ],
  },
  {
    name: "Curator",
    tagline: "Library quality & content organization.",
    icon: Sparkles,
    color: "text-secondary",
    badge: "bg-secondary/10 text-secondary border-secondary/20",
    bullets: [
      "Can view all content, including private items and drafts.",
      "Edit metadata, cover art, and organization for any track or album.",
      "Helps maintain library structure and correct errors.",
      "With an artist link, can publish like an Artist.",
    ],
  },
  {
    name: "Manager",
    tagline: "Full admin for community & content.",
    icon: Shield,
    color: "text-primary",
    badge: "bg-primary/10 text-primary border-primary/20",
    bullets: [
      "View the registered users list.",
      "Manage federated follows and synchronization.",
      "Moderate posts and releases across the instance.",
      "Operate as any artist they are assigned to.",
    ],
  },
  {
    name: "Instance Owner",
    tagline: "Root admin — the highest authority.",
    icon: Crown,
    color: "text-red-500",
    badge: "bg-red-500/10 text-red-500 border-red-500/20",
    bullets: [
      "Configure the site: name, description, URL, logos, backgrounds.",
      "Set up Web3 payment wallets (USDC/USDT) and NFT contracts.",
      "Full user management: create roles, reset passwords, delete accounts.",
      "Access cryptographic keys and server-level maintenance.",
    ],
  },
];

type MatrixRow = {
  capability: string;
  // owner, manager, curator, artist, listener
  values: (boolean | string)[];
};

const MATRIX: MatrixRow[] = [
  { capability: "Listen, buy & favorite", values: [true, true, true, true, true] },
  { capability: "Playlists, comments, follows", values: [true, true, true, true, true] },
  { capability: "Upload music / create releases", values: [true, true, "link", true, false] },
  { capability: "Sell music / store assets", values: [true, true, "link+", "flag", false] },
  { capability: "Social posts (federation)", values: [true, true, "link", true, false] },
  { capability: "Edit others' content", values: [true, true, true, false, false] },
  { capability: "Manage federation", values: [true, true, false, false, false] },
  { capability: "Manage users", values: [true, "view", false, false, false] },
  { capability: "Modify site settings", values: [true, false, false, false, false] },
];

const MATRIX_COLS = ["Owner", "Manager", "Curator", "Artist", "Listener"];

const Cell = ({ value }: { value: boolean | string }) => {
  if (value === true)
    return <Check size={16} className="text-success mx-auto" aria-label="Yes" />;
  if (value === false)
    return <X size={16} className="text-base-content/20 mx-auto" aria-label="No" />;
  const labels: Record<string, string> = {
    link: "with artist link",
    "link+": "link + flag",
    flag: "if enabled",
    view: "view only",
  };
  return (
    <span className="text-[10px] font-bold text-warning whitespace-nowrap">
      {labels[value] ?? value}
    </span>
  );
};

type Feature = {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  desc: string;
  to?: string;
};

const FEATURES: Feature[] = [
  { icon: Headphones, title: "Stream & Discover", desc: "Browse releases, artists, and tracks, and dig into the catalog.", to: "/albums" },
  { icon: ListMusic, title: "Playlists & Favorites", desc: "Curate your own collections and save what you love.", to: "/playlists" },
  { icon: ShoppingBag, title: "Store", desc: "Buy music and digital items directly from artists.", to: "/store" },
  { icon: Globe, title: "Network", desc: "A federated platform connected over ActivityPub to other instances.", to: "/network" },
  { icon: Radio, title: "Live", desc: "Tune into live sessions and broadcasts.", to: "/live" },
  { icon: Upload, title: "Studio", desc: "Artists & staff publish releases and manage their catalog.", to: "/publish" },
];

const Guide = () => {
  return (
    <div className="p-4 lg:p-8 animate-fade-in max-w-5xl mx-auto space-y-12">
      <PageHeader
        title="How TuneCamp Works"
        subtitle="A quick tour of the platform, the roles, and what you can do here"
        icon={BookOpen}
        iconColor="text-primary"
      />

      {/* Intro */}
      <div className="bg-gradient-to-br from-primary/10 to-secondary/10 rounded-3xl p-8 border border-base-content/5 space-y-3">
        <h2 className="text-2xl font-black tracking-tight">A platform for independent music</h2>
        <p className="opacity-70 leading-relaxed max-w-3xl">
          TuneCamp is a self-hosted, federated music platform. Artists publish and
          sell their work directly to fans — no middleman — while listeners stream,
          collect, and connect across a network of independent instances. What you
          can do depends on your <strong>role</strong>, explained below.
        </p>
      </div>

      {/* Roles */}
      <section className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-black tracking-tight">The roles</h2>
          <p className="opacity-60 text-sm">
            From everyday listeners to the instance owner. Most people start as a Listener
            and become an Artist by linking an artist profile.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {ROLES.map((r) => (
            <div
              key={r.name}
              className="card bg-base-200 border border-base-content/5 shadow-level-1 transition-all hover:-translate-y-1"
            >
              <div className="card-body">
                <div className="flex items-center gap-3 mb-1">
                  <div className={`w-11 h-11 rounded-xl bg-base-300/60 flex items-center justify-center ${r.color}`}>
                    <r.icon size={24} />
                  </div>
                  <div className="min-w-0">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-black tracking-normal border ${r.badge}`}
                    >
                      {r.name}
                    </span>
                    <p className="text-xs opacity-60 mt-1">{r.tagline}</p>
                  </div>
                </div>
                <ul className="space-y-2 mt-2">
                  {r.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm opacity-80">
                      <Check size={15} className="text-success mt-0.5 flex-shrink-0" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        {/* Become an artist callout */}
        <div className="card bg-accent/5 border border-accent/20">
          <div className="card-body flex-row items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center text-accent flex-shrink-0">
              <Mic2 size={24} />
            </div>
            <div className="space-y-1">
              <h3 className="font-black text-lg">Becoming an artist</h3>
              <p className="opacity-70 text-sm leading-relaxed">
                An artist account is one linked to an artist profile. From{" "}
                <Link to="/profile" className="link link-accent font-semibold">
                  Profile → Become an Artist
                </Link>{" "}
                you can request one; once an admin approves it, your account is
                promoted and an artist profile is created and linked. Selling is then
                enabled per-artist by staff.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Permission matrix */}
      <section className="space-y-4">
        <h2 className="text-2xl font-black tracking-tight">At a glance</h2>
        <div className="card bg-base-200 border border-base-content/5 overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th className="text-left">Capability</th>
                {MATRIX_COLS.map((c) => (
                  <th key={c} className="text-center text-xs">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((row) => (
                <tr key={row.capability} className="hover">
                  <td className="font-medium text-sm">{row.capability}</td>
                  {row.values.map((v, i) => (
                    <td key={i} className="text-center">
                      <Cell value={v} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs opacity-50">
          “with artist link” = needs a linked artist profile · “if enabled” = per-artist
          Sales flag set by staff · “view only” = read access without editing.
        </p>
      </section>

      {/* Main sections */}
      <section className="space-y-6">
        <h2 className="text-2xl font-black tracking-tight">What's around the app</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => {
            const inner = (
              <div className="card bg-base-200 border border-base-content/5 shadow-level-1 transition-all hover:-translate-y-1 h-full">
                <div className="card-body">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-2 text-primary">
                    <f.icon size={22} />
                  </div>
                  <h3 className="font-bold">{f.title}</h3>
                  <p className="opacity-60 text-sm">{f.desc}</p>
                </div>
              </div>
            );
            return f.to ? (
              <Link key={f.title} to={f.to} className="block">
                {inner}
              </Link>
            ) : (
              <div key={f.title}>{inner}</div>
            );
          })}
        </div>
      </section>

      {/* Footer CTA */}
      <div className="rounded-3xl p-8 border border-base-content/5 bg-base-200 text-center space-y-4">
        <div className="flex justify-center text-primary">
          <Heart size={28} />
        </div>
        <h2 className="text-2xl font-black tracking-tight">Ready to dive in?</h2>
        <p className="opacity-70 max-w-2xl mx-auto">
          Start listening, build a playlist, or — if you make music — request an artist
          profile and publish your first release.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link to="/albums" className="btn btn-primary">Browse Music</Link>
          <Link to="/about" className="btn btn-ghost">About TuneCamp</Link>
        </div>
      </div>
    </div>
  );
};

export default Guide;
