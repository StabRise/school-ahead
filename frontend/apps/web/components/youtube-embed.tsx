export function YoutubeEmbed({ videoId, title }: { videoId: string; title?: string }) {
  return (
    <div className="aspect-video w-full overflow-hidden rounded-md">
      <iframe
        className="h-full w-full"
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title={title ?? "YouTube video"}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}
