import { redirect, notFound } from 'next/navigation';

import { auth } from '@/app/(auth)/auth';
import { getUserById } from '@/lib/db/queries';
import { getUserPosts, getFollowers, getFollowing } from '@/lib/db/dynamo-queries';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  const { id } = await params;
  const [profileUser, { items: posts }, followers, following] = await Promise.all([
    getUserById(id),
    getUserPosts(id, 20),
    getFollowers(id),
    getFollowing(id),
  ]);

  if (!profileUser) notFound();

  const isOwnProfile = session.user.id === id;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <Card className="p-6 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-bold">
              {profileUser.displayName ?? profileUser.email}
            </h1>
            {profileUser.bio && (
              <p className="text-sm text-muted-foreground">{profileUser.bio}</p>
            )}
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>{followers.length} followers</span>
              <span>{following.length} following</span>
            </div>
          </div>

          {!isOwnProfile && (
            <div className="flex gap-2">
              <form method="POST" action={`/api/social/users/${id}/follow`}>
                <Button type="submit" size="sm">Follow</Button>
              </form>
              <form method="POST" action={`/api/social/users/${id}/block`}>
                <Button type="submit" variant="outline" size="sm">Block</Button>
              </form>
            </div>
          )}
        </div>
      </Card>

      <h2 className="text-lg font-semibold">Posts</h2>

      {posts.length === 0 && (
        <p className="text-muted-foreground text-sm">No posts yet.</p>
      )}

      {posts.map((post) => (
        <Card key={post.postId as string} className="p-4 space-y-2">
          {post.caption && (
            <p className="text-sm font-semibold">{post.caption as string}</p>
          )}
          <p className="text-sm whitespace-pre-wrap">{post.content as string}</p>
          <span className="text-xs text-muted-foreground">
            {new Date(post.createdAt as string).toLocaleDateString()}
          </span>
        </Card>
      ))}
    </div>
  );
}
