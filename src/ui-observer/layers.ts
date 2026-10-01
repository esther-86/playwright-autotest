export interface CaptureLayers {
  interactions: boolean;
  html: boolean;
  screenshots: boolean;
  network: boolean;
  console: boolean;
  audio: boolean;
}
export const defaultLayers: CaptureLayers = { interactions: true, html: true, screenshots: true, network: true, console: true, audio: true };
export function parseLayers(value: unknown): CaptureLayers {
  if (!value || typeof value !== 'object') throw new Error('Capture settings required');
  const layers = {} as CaptureLayers;
  for (const key of Object.keys(defaultLayers) as (keyof CaptureLayers)[]) {
    if (typeof (value as any)[key] !== 'boolean') throw new Error('Invalid capture setting: ' + key);
    layers[key] = (value as any)[key];
  }
  if (!layers.interactions && (layers.html || layers.screenshots)) throw new Error('HTML and screenshots require interactions');
  return layers;
}
