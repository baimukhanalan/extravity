export function normalizeMediaRightsEvidence(value: string | null | undefined): string | null {
  const evidence = value?.trim() ?? "";
  if (evidence.length < 8 || evidence.length > 500 || /[\u0000-\u001f]/.test(evidence)) return null;
  return evidence;
}
