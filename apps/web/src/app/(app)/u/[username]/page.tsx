'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { PostCard } from '@/components/post-card';
import { getCurrentUser, listPosts } from '@/lib/api';
import { Calendar, FileText, MessageSquare } from 'lucide-react';
import type { CurrentUser, Post } from '@/types/api';

export default function UserProfilePage() {
  const params = useParams();
  const username = decodeURIComponent(String(params.username));
  const [profile, setProfile] = React.useState<CurrentUser | null>(null);
  const [posts, setPosts] = React.useState<Post[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [retryKey, setRetryKey] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    async function load() {
      try {
        const [user, allPosts] = await Promise.all([getCurrentUser(), listPosts({ sort: 'new' })]);
        if (!active) return;
        if (user && user.username === username) {
          setProfile(user);
        }
        setPosts(
          allPosts.items.filter((p) => {
            if (p.author.type === 'anonymous') return false;
            return p.author.user.username === username;
          }),
        );
      } catch (requestError) {
        if (active) setError((requestError as Error).message || '用户主页加载失败');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [retryKey, username]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>用户主页暂时无法加载</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setRetryKey((key) => key + 1)}
            className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90"
          >
            重新加载
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
            {username[0]}
          </div>
          <div>
            <CardTitle className="text-xl">{username}</CardTitle>
            <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
              {profile && (
                <>
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3.5" />
                    注册于 {new Date(profile.createdAt).toLocaleDateString('zh-CN')}
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="size-3.5" />
                    发帖 {posts.length}
                  </span>
                </>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <Separator />

      <h2 className="text-lg font-semibold">发布的帖子</h2>
      {posts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <MessageSquare className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-2">暂无帖子</p>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserRole={profile?.role}
              isLoggedIn={!!profile}
            />
          ))}
        </div>
      )}
    </div>
  );
}
