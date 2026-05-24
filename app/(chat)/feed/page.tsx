import { redirect } from 'next/navigation';

import { auth } from '@/app/(auth)/auth';
import { getFeed } from '@/lib/db/dynamo-queries';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default async function FeedPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  const { items: posts } = await getFeed(20);

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-4">
      <h1 className="text-2xl font-bold">Feed</h1>

      {posts.length === 0 && (
        <p className="text-muted-foreground">No posts yet. Be the first to share!</p>
      )}

      {posts.map((post) => (
        <Card key={post.postId as string} className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <a
              href={`/profile/${post.userId}`}
              className="text-sm font-medium hover:underline"
            >
              {post.userId as string}
            </a>
            <span className="text-xs text-muted-foreground">
              {new Date(post.createdAt as string).toLocaleDateString()}
            </span>
          </div>

          {post.caption && (
            <p className="text-sm font-semibold">{post.caption as string}</p>
          )}

          <p className="text-sm whitespace-pre-wrap">{post.content as string}</p>

          {(post.mediaUrls as string[])?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(post.mediaUrls as string[]).map((url) => (
                <img
                  key={url}
                  src={url}
                  alt="post media"
                  className="rounded max-h-48 object-cover"
                />
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              formAction={`/api/social/posts/${post.postId}/likes`}
            >
              Like
            </Button>
            <a href={`/api/social/posts/${post.postId}/comments`}>
              <Button variant="ghost" size="sm">
                Comments
              </Button>
            </a>
          </div>
        </Card>
      ))}
    </div>
  );
}
