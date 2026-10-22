import { createFileRoute } from '@tanstack/react-router';
import { VideoArchivePage } from '@/features/videos/video-archive-page';

export const Route = createFileRoute('/_app/spaces/$spaceId/videos')({
  component: VideosRoute,
});

function VideosRoute() {
  const { spaceId } = Route.useParams();
  return <VideoArchivePage spaceId={spaceId} />;
}
