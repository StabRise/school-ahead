import { useTranslations } from "next-intl";
import type { SubjectOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Card } from "@/components/card";
import { Markdown } from "@/components/markdown";

export function SubjectCard({ subject }: { subject: SubjectOut }) {
  const t = useTranslations("MySubjects");
  const activeBlock = subject.blocks.find((block) => block.status === "active");

  return (
    <Card>
      <p className="font-medium">{subject.name}</p>

      {subject.description && <Markdown content={subject.description} />}

      <p className="mt-2 text-xs text-gray-400">
        {t("blocksCount", { count: subject.block_count })}
        {activeBlock && ` · ${activeBlock.label}`}
      </p>
    </Card>
  );
}
