export const DOCUMENT_TYPES = [
  "cv",
  "student_id",
  "passport",
  "photo",
  "certificate",
  "diploma",
  "transcript",
  "recommendation",
  "motivation_letter",
  "parental_consent",
  "project_presentation",
  "portfolio",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

const LEGACY_DOCUMENT_TYPE_ALIASES: Record<string, DocumentType> = {
  motivation: "motivation_letter",
  id: "student_id",
};

export function normalizeDocumentType(value: string): DocumentType | null {
  const normalized = value.trim().toLowerCase();
  const canonical = LEGACY_DOCUMENT_TYPE_ALIASES[normalized] ?? normalized;
  return DOCUMENT_TYPES.includes(canonical as DocumentType) ? canonical as DocumentType : null;
}
