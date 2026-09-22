"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import {
  getListTutorReadingSyllablesQueryKey,
  useImportTutorReadingSyllables,
  useListTutorReadingSyllables,
} from "@school-ahead/api-client/browser/reading/reading";
import { SimplePageContainer } from "@/components/simple/page-container";
import { useDialogs } from "@/components/dialogs/app-dialogs";

// Uploads a ZIP shaped like the legacy public/static/syllables/<consonant>/
// {words.json,<syllable>.png} asset folder (see backend's reading/
// services.py::import_syllables_archive) — the tutor "Syllables" table's
// bulk-loading button. Same "hidden <input type=file>, click to trigger"
// pattern as tutor-stories-page.tsx's ImportStoryButton.
function ImportSyllablesButton() {
  const t = useTranslations("TutorSyllables");
  const dialogs = useDialogs();
  const queryClient = useQueryClient();
  const importSyllables = useImportTutorReadingSyllables();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the exact same file later
    if (!file) return;
    importSyllables.mutate(
      { data: { file } },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getListTutorReadingSyllablesQueryKey() });
          void dialogs.alert(
            t("importResult", { created: result.created, updated: result.updated, skipped: result.skipped }),
          );
        },
        onError: () => dialogs.error(t("importError")),
      },
    );
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={handleFileSelected}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={importSyllables.isPending}
        className="flex shrink-0 items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        <Upload className="h-3.5 w-3.5" />
        {importSyllables.isPending ? t("importingStatus") : t("importButton")}
      </button>
    </>
  );
}

export function TutorSyllablesPage() {
  const t = useTranslations("TutorSyllables");
  const { data: syllables, isLoading, isError } = useListTutorReadingSyllables();

  return (
    <SimplePageContainer title={t("title")}>
      <div className="mb-3 flex items-center justify-end gap-2">
        <ImportSyllablesButton />
      </div>

      {isLoading && <p className="text-sm text-gray-500">{t("loading")}</p>}
      {isError && <p className="text-sm text-red-600">{t("error")}</p>}
      {!isLoading && !isError && (syllables?.length ?? 0) === 0 && <p className="text-sm text-gray-500">{t("empty")}</p>}

      {syllables && syllables.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500">
              <tr>
                <th className="px-4 py-2">{t("columnIcon")}</th>
                <th className="px-4 py-2">{t("columnSyllable")}</th>
                <th className="px-4 py-2">{t("columnWord")}</th>
                <th className="px-4 py-2">{t("columnLanguage")}</th>
                <th className="px-4 py-2">{t("columnDefault")}</th>
                <th className="px-4 py-2">{t("columnSyllableAudio")}</th>
                <th className="px-4 py-2">{t("columnWordAudio")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {syllables.map((syllable) => (
                <tr key={syllable.id}>
                  <td className="px-4 py-2">
                    {syllable.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={syllable.icon} alt="" className="h-10 w-10 rounded-md object-cover" />
                    ) : (
                      <span className="block h-10 w-10 rounded-md bg-gray-100" />
                    )}
                  </td>
                  <td className="px-4 py-2 text-base font-extrabold">
                    <span style={{ color: "#0369a1" }}>{syllable.first_letter}</span>
                    <span style={{ color: "#dc2626" }}>{syllable.second_part}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-900">{syllable.word}</td>
                  <td className="px-4 py-2 text-gray-600">{syllable.language}</td>
                  <td className="px-4 py-2">
                    {syllable.is_default && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        {t("defaultBadge")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {syllable.syllable_audio ? (
                      <audio controls src={syllable.syllable_audio} className="h-8 w-36" />
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {syllable.word_audio ? (
                      <audio controls src={syllable.word_audio} className="h-8 w-36" />
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SimplePageContainer>
  );
}
