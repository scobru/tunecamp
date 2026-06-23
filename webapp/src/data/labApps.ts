export interface LabApp {
  id: string;
  name: string;
  description: string;
  src: string;
  category: 'recording' | 'synthesis' | 'composition' | 'effects' | 'other';
  author: string;
  sourceUrl: string;
  permissions: string[];
  // iFrame sandbox permissions needed
  sandbox: string[];
  // iFrame feature-policy permissions
  allow: string[];
}

export const LAB_APPS: LabApp[] = [
  {
    id: '4track',
    name: '4-Track Recorder',
    description: 'Browser-based 4-track audio recorder with overdub support, latency compensation, and sample-accurate multi-track playback. Runs entirely in your browser — no server needed.',
    src: 'https://www.4track.cc',
    category: 'recording',
    author: 'andreboekhorst',
    sourceUrl: 'https://github.com/andreboekhorst/4-track-recorder',
    permissions: ['microphone'],
    sandbox: ['allow-scripts', 'allow-same-origin', 'allow-downloads', 'allow-forms'],
    allow: ['microphone'],
  },
];

export const CATEGORY_LABELS: Record<LabApp['category'], string> = {
  recording: 'Recording',
  synthesis: 'Synthesis',
  composition: 'Composition',
  effects: 'Effects',
  other: 'Other',
};

export const CATEGORY_COLORS: Record<LabApp['category'], string> = {
  recording: 'badge-error',
  synthesis: 'badge-secondary',
  composition: 'badge-primary',
  effects: 'badge-accent',
  other: 'badge-neutral',
};
