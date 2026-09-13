import { StoryEditorPage } from "@/components/tutor/story-editor-page";

// Renders the editor immediately, with no Story row yet — the first
// autosave tick (or an explicit Save) creates it, a few seconds in. See
// StoryEditorPage/StoryForm for the create-then-switch-to-update flow.
export default function NewStoryPage() {
  return <StoryEditorPage storyId={null} />;
}
