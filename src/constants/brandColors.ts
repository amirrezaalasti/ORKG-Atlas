/**
 * Brand palette: EmpiRE Compass coral primary; blue as MUI secondary accent.
 * Keep in sync with hardcoded chart/UI hex where imports are not used.
 */
export const brandColors = {
  primary: {
    main: '#e86161',
    light: '#ff8f8f',
    dark: '#b13737',
    hover: '#d45555',
  },
  primaryDarkMode: {
    main: '#ff7b7b',
    light: '#ff9d9d',
    dark: '#cc4444',
    contrastText: '#ffffff',
  },
  secondary: {
    main: '#1e88e5',
    light: '#6ab7ff',
    dark: '#005cb2',
  },
  secondaryDarkMode: {
    main: '#64b5f6',
    light: '#9be7ff',
    dark: '#0077c2',
  },
  /** Archival amber for snapshot / backup-mode UI (not MUI warning yellow). */
  snapshot: {
    main: '#c45c26',
    wash: '#fbf4eb',
    ink: '#7a3910',
  },
  snapshotDarkMode: {
    main: '#e08a4f',
    wash: '#2a1c12',
    ink: '#f3d5b8',
  },
} as const;

export const getSnapshotColors = (mode: 'light' | 'dark') =>
  mode === 'dark' ? brandColors.snapshotDarkMode : brandColors.snapshot;

/** Old Atlas light-blue primary stored on chart settings in Firestore. */
const LEGACY_PRIMARY_HEX = new Set(['#039be5', '#0277bd']);

export function resolveChartColor(color: string): string {
  return LEGACY_PRIMARY_HEX.has(color.toLowerCase())
    ? brandColors.primary.main
    : color;
}

export function resolveChartColors(
  colors?: readonly string[]
): string[] | undefined {
  return colors?.map(resolveChartColor);
}
