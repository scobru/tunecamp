declare module 'color-thief-react' {
  export interface ColorThiefOptions {
    crossOrigin?: string;
    quality?: number;
  }
  export interface ColorThiefResult {
    data: string | null;
    loading: boolean;
    error: any;
  }
  export function useColor(
    url: string,
    format: 'hex' | 'rgb' | 'hsl',
    options?: ColorThiefOptions
  ): ColorThiefResult;
}
