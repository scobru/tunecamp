import { Link } from "react-router-dom";
import { Music, Shield, Users, Zap, Globe, Cpu, Brain, CreditCard, Cloud, Layout } from "lucide-react";

export const About = () => {
  return (
    <div className="p-4 lg:p-8 animate-fade-in max-w-5xl mx-auto space-y-12">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          About TuneCamp
        </h1>
        <p className="text-xl opacity-70 max-w-2xl mx-auto">
          A decentralized music platform designed to empower independent artists
          and provide a premium, self-hosted streaming experience.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="card bg-base-200 border border-base-content/5 shadow-xl hover:shadow-2xl transition-all">
          <div className="card-body">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 text-primary">
              <Cpu size={28} />
            </div>
            <h2 className="card-title text-xl">Core Architecture</h2>
            <p className="opacity-70">
              A full-featured Node.js/Express server for self-hosted music
              streaming and library management with a robust CLI.
            </p>
          </div>
        </div>

        <div className="card bg-base-200 border border-base-content/5 shadow-xl hover:shadow-2xl transition-all">
          <div className="card-body">
            <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center mb-4 text-secondary">
              <Music size={28} />
            </div>
            <h2 className="card-title text-xl">Music Management</h2>
            <p className="opacity-70">
              Automated metadata parsing, recursive library scanning, and
              high-quality streaming with visual waveform generation.
            </p>
          </div>
        </div>

        <div className="card bg-base-200 border border-base-content/5 shadow-xl hover:shadow-2xl transition-all">
          <div className="card-body">
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4 text-accent">
              <Globe size={28} />
            </div>
            <h2 className="card-title text-xl">Connectivity</h2>
            <p className="opacity-70">
              Federated social features powered by ActivityPub and Subsonic API
              support for third-party mobile clients.
            </p>
          </div>
        </div>

        <div className="card bg-base-200 border border-base-content/5 shadow-xl hover:shadow-2xl transition-all">
          <div className="card-body">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 text-primary">
              <Shield size={28} />
            </div>
            <h2 className="card-title text-xl">Security & Privacy</h2>
            <p className="opacity-70">
              Decentralized data with Zen protocol, secure JWT-based authentication,
              and "pay-what-you-want" unlock codes.
            </p>
          </div>
        </div>

        <div className="card bg-base-200 border border-base-content/5 shadow-xl hover:shadow-2xl transition-all">
          <div className="card-body">
            <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center mb-4 text-secondary">
              <Users size={28} />
            </div>
            <h2 className="card-title text-xl">Empowering Artists</h2>
            <p className="opacity-70">
              Direct connection between artists and listeners without
              intermediaries. Own your data, your platform, and your audience.
            </p>
          </div>
        </div>

        <div className="card bg-base-200 border border-base-content/5 shadow-xl hover:shadow-2xl transition-all">
          <div className="card-body">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 text-primary">
              <Brain size={28} />
            </div>
            <h2 className="card-title text-xl">AI Intelligence</h2>
            <p className="opacity-70">
              Automated album identification and metadata enrichment powered by AI.
              Keep your library perfectly organized with smart tools.
            </p>
          </div>
        </div>

        <div className="card bg-base-200 border border-base-content/5 shadow-xl hover:shadow-2xl transition-all">
          <div className="card-body">
            <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center mb-4 text-secondary">
              <CreditCard size={28} />
            </div>
            <h2 className="card-title text-xl">Monetization</h2>
            <p className="opacity-70">
              Direct artist-to-fan sales with integrated Stripe support.
              Receive payments without middleman platform fees.
            </p>
          </div>
        </div>

        <div className="card bg-base-200 border border-base-content/5 shadow-xl hover:shadow-2xl transition-all">
          <div className="card-body">
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4 text-accent">
              <Cloud size={28} />
            </div>
            <h2 className="card-title text-xl">Cloud Connectivity</h2>
            <p className="opacity-70">
              Seamlessly integrate with Google Drive. Stream from the cloud or
              localize tracks to your private server with a single click.
            </p>
          </div>
        </div>

        <div className="card bg-base-200 border border-base-content/5 shadow-xl hover:shadow-2xl transition-all">
          <div className="card-body">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 text-primary">
              <Layout size={28} />
            </div>
            <h2 className="card-title text-xl">Immersive Playback</h2>
            <p className="opacity-70">
              Experience your music through a cinematic "Canvas" view with
              large-scale waveforms and high-quality artwork displays.
            </p>
          </div>
        </div>

        <div className="card bg-base-200 border border-base-content/5 shadow-xl hover:shadow-2xl transition-all">
          <div className="card-body">
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4 text-accent">
              <Zap size={28} />
            </div>
            <h2 className="card-title text-xl">Modern Design</h2>
            <p className="opacity-70">
              A premium React-based frontend using Tailwind CSS and DaisyUI,
              optimized for both desktop and mobile devices.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-primary/10 to-secondary/10 rounded-3xl p-8 border border-base-content/5 text-center space-y-6">
        <h2 className="text-3xl font-bold">Open Source & Community Driven</h2>
        <p className="text-lg opacity-70 max-w-3xl mx-auto">
          TuneCamp is built by and for the independent music community. We
          believe in a future where music is decentralized, accessible, and fair
          for everyone.
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="https://github.com/scobru/tunecamp"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            GitHub
          </a>
          <Link to="/" className="btn btn-ghost">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default About;

