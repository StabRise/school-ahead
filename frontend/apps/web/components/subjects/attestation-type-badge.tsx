"use client";

import { useTranslations } from "next-intl";

// Reflects Subject.attestation_type (tutor-editable from the tutor's
// Subject detail page) — shown wherever a subject is listed, same idiom as
// IsFilledBadge. Renders nothing for "none" so an un-attested subject isn't
// visually flagged, just unmarked.
export function AttestationTypeBadge({ attestationType }: { attestationType: string }) {
  const t = useTranslations("SubjectDetail");

  if (attestationType === "test") return <span className="shrink-0 text-xs text-gray-500">{t("attestationTest")}</span>;
  if (attestationType === "exam") return <span className="shrink-0 text-xs text-gray-500">{t("attestationExam")}</span>;
  if (attestationType === "project") return <span className="shrink-0 text-xs text-gray-500">{t("attestationProject")}</span>;
  return null;
}
