import { useTranslations } from "next-intl";
import type { SubjectOut } from "@/lib/api/browser/schoolAheadAPI.schemas";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/card";
import { Markdown } from "@/components/markdown";

export function SubjectCard({ subject }: { subject: SubjectOut }) {
  const t = useTranslations("MySubjects");
  const activeBlock = subject.blocks.find((block) => block.status === "active");

  return (
    <Card>
      {/* Only the name links out — the description below can itself contain
          markdown links, and nesting an <a> inside the card's own <a> would
          be invalid HTML (see Card's href mode). */}
      <Link href={`/subjects/${subject.id}`} className="font-medium hover:underline">
        {subject.name}
      </Link>

      {subject.description && <Markdown content={subject.description} />}

      <p className="mt-2 text-xs text-gray-400">
        {t("blocksCount", { count: subject.block_count })}
        {activeBlock && ` · ${activeBlock.label}`}
      </p>
    </Card>
  );
}
