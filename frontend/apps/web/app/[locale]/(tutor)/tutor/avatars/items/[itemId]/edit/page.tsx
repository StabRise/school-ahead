import { getTranslations } from "next-intl/server";
import { AvatarItemArtworkEditorPage } from "@school-ahead/avatar";
import { Link } from "@/i18n/navigation";
import { PageContainer } from "@/components/page-container";

export default async function EditAvatarItemArtworkPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const t = await getTranslations("TutorAvatarEditor");

  return (
    <PageContainer>
      <Link href="/tutor/avatars" className="mb-4 inline-block text-sm font-medium text-blue-700 hover:underline">
        {t("backToAvatars")}
      </Link>
      <AvatarItemArtworkEditorPage itemId={Number(itemId)} />
    </PageContainer>
  );
}
