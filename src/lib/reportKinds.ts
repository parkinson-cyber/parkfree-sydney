/**
 * The crowd-report vocabulary, with no React Native imports, so the rules
 * tests can exercise the availability estimate without pulling in the app.
 */

export type ReportKind = 'left' | 'looks_empty' | 'parked' | 'looks_full';

export interface Report {
  id: string;
  latitude: number;
  longitude: number;
  kind: ReportKind;
  streetId: number | null;
  streetName: string | null;
  source: 'user';
  reportedAt: string;
  expiresAt: string;
  reportedBy: string;
}

/** "A space is free" reports, as opposed to "it's taken". */
export function isFreeKind(kind: ReportKind): boolean {
  return kind === 'left' || kind === 'looks_empty';
}
