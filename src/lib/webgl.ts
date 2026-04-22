/**
 * Detects whether the current browser can create a WebGL context.
 *
 * Used to gate rendering of optional 3D visualizations (e.g. the homepage
 * globe). Headless reviewers, locked-down corporate browsers, and some bots
 * don't support WebGL — those visitors must still see a usable site.
 */
export function isWebGLAvailable(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    return !!gl;
  } catch {
    return false;
  }
}
