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
