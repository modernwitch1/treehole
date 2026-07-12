'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Plus,
  MessageSquare,
  Clock,
  Users,
  Trash2,
  X,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';
import {
  getChatrooms,
  createChatroom,
  closeChatroom,
  getCurrentUser,
  uploadChatroomImage,
} from '@/lib/api';
import type { ChatroomDetail, CurrentUser } from '@/types/api';
import { toast } from 'sonner';
import { CommunitySafetyNotice } from '@/components/community-safety-notice';

export default function ChatroomsListPage() {
  const router = useRouter();
  const [rooms, setRooms] = React.useState<ChatroomDetail[]>([]);
  const [currentUser, setCurrentUser] = React.useState<CurrentUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  // Form states
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [backgroundFile, setBackgroundFile] = React.useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const [bgPreview, setBgPreview] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [rulesAcknowledged, setRulesAcknowledged] = React.useState(false);

  const fetchRoomsAndUser = React.useCallback(async () => {
    try {
      const [allRooms, user] = await Promise.all([getChatrooms(), getCurrentUser()]);
      setRooms(allRooms);
      setCurrentUser(user);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchRoomsAndUser();
    // Poll for rooms list updates every 10 seconds
    const interval = setInterval(fetchRoomsAndUser, 10000);
    return () => clearInterval(interval);
  }, [fetchRoomsAndUser]);

  // Handle image selections with 2MB validation
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'bg') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: 2MB
    if (file.size > 2 * 1024 * 1024) {
      toast.error('上传图片不能大于 2MB！');
      e.target.value = ''; // clear input
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    if (type === 'avatar') {
      setAvatarFile(file);
      setAvatarPreview(previewUrl);
    } else {
      setBackgroundFile(file);
      setBgPreview(previewUrl);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('请输入聊天房主题');
      return;
    }
    if (!rulesAcknowledged) {
      toast.error('请先确认聊天房主题和简介遵守社区规则');
      return;
    }

    setSubmitting(true);
    try {
      let avatarUrl = '';
      let backgroundUrl = '';

      // Upload files if selected
      if (avatarFile) {
        const res = await uploadChatroomImage(avatarFile);
        avatarUrl = res.url;
      }
      if (backgroundFile) {
        const res = await uploadChatroomImage(backgroundFile);
        backgroundUrl = res.url;
      }

      const newRoom = await createChatroom({
        title: title.trim(),
        description: description.trim() || undefined,
        avatarUrl: avatarUrl || undefined,
        backgroundUrl: backgroundUrl || undefined,
        rulesAcknowledged,
      });

      toast.success('聊天房创建成功！');
      setDialogOpen(false);
      // Reset form
      setTitle('');
      setDescription('');
      setAvatarFile(null);
      setBackgroundFile(null);
      setAvatarPreview(null);
      setBgPreview(null);
      setRulesAcknowledged(false);

      // Redirect directly to the room
      router.push(`/chatrooms/${newRoom.uid}`);
    } catch (err) {
      toast.error((err as Error).message || '创建聊天房失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseRoom = async (uid: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('确定要提前关闭这个聊天房吗？关闭后将无法再发言。')) return;

    try {
      await closeChatroom(uid);
      toast.success('聊天房已关闭');
      fetchRoomsAndUser();
    } catch (err) {
      toast.error((err as Error).message || '关闭聊天房失败');
    }
  };

  // Helper: calculate remaining time string
  const getRemainingTime = (expiresAtStr: string) => {
    const remainingMs = new Date(expiresAtStr).getTime() - Date.now();
    if (remainingMs <= 0) return '已过期';
    const hours = Math.floor(remainingMs / (3600 * 1000));
    const minutes = Math.floor((remainingMs % (3600 * 1000)) / (60 * 1000));
    if (hours > 0) {
      return `剩 ${hours} 小时 ${minutes} 分钟`;
    }
    return `剩 ${minutes} 分钟`;
  };

  const activeRooms = rooms.filter((r) => r.isActive);

  if (loading && rooms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="size-8 animate-spin text-orange-500" />
        <p className="text-sm text-muted-foreground">加载聊天房中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">在线聊天房</h1>
          <p className="text-sm text-muted-foreground mt-1">
            匿名的实时公共聊天室。房间开放 2 小时，关闭后常规记录默认留存 180
            天。全平台最多可同时存在 10 个房间。
          </p>
        </div>

        <Dialog
          open={dialogOpen}
          onOpenChange={(nextOpen) => {
            if (!nextOpen && submitting) return;
            setDialogOpen(nextOpen);
            if (!nextOpen) setRulesAcknowledged(false);
          }}
        >
          <DialogTrigger asChild>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white font-medium shadow-sm transition-transform active:scale-95">
              <Plus className="size-4 mr-2" /> 发起聊天房
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px] bg-background border border-border">
            <DialogHeader>
              <DialogTitle>新建在线聊天房</DialogTitle>
              <DialogDescription>
                创建一间开放 2 小时的多人聊天室，每个人每天最多可以开启 2 个房间。
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateRoom} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="room-title">房间主题 (必填)</Label>
                <Input
                  id="room-title"
                  placeholder="如：今晚食堂吃什么？"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="room-desc">房间简介 (选填)</Label>
                <textarea
                  id="room-desc"
                  placeholder="简单描述一下聊天内容吧..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  rows={3}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Avatar upload */}
                <div className="space-y-2">
                  <Label>聊天房头像 (最大 2MB)</Label>
                  <div className="flex flex-col items-center justify-center border border-dashed border-border rounded-lg p-3 hover:bg-accent/50 transition-colors relative h-28">
                    {avatarPreview ? (
                      <div className="relative size-16 group">
                        <Image
                          src={avatarPreview}
                          alt="聊天房头像预览"
                          width={64}
                          height={64}
                          unoptimized
                          className="size-full object-cover rounded-full"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setAvatarFile(null);
                            setAvatarPreview(null);
                          }}
                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center text-center">
                        <ImageIcon className="size-6 text-muted-foreground mb-1" />
                        <span className="text-xs text-muted-foreground">选择图片</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleImageChange(e, 'avatar')}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Background upload */}
                <div className="space-y-2">
                  <Label>聊天页面背景 (最大 2MB)</Label>
                  <div className="flex flex-col items-center justify-center border border-dashed border-border rounded-lg p-3 hover:bg-accent/50 transition-colors relative h-28">
                    {bgPreview ? (
                      <div className="relative w-full h-16 group">
                        <Image
                          src={bgPreview}
                          alt="聊天房背景预览"
                          fill
                          sizes="50vw"
                          unoptimized
                          className="size-full object-cover rounded-md"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setBackgroundFile(null);
                            setBgPreview(null);
                          }}
                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center text-center">
                        <ImageIcon className="size-6 text-muted-foreground mb-1" />
                        <span className="text-xs text-muted-foreground">选择背景</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleImageChange(e, 'bg')}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>

              <CommunitySafetyNotice compact privateChannel />

              <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-xs leading-relaxed">
                <input
                  type="checkbox"
                  checked={rulesAcknowledged}
                  onChange={(event) => setRulesAcknowledged(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  我确认房间主题、简介和后续发言均遵守社区规则，并知悉违规内容可能被拦截、处罚和依法依规溯源。
                </span>
              </label>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={submitting}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                  disabled={submitting || !rulesAcknowledged}
                >
                  {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
                  {submitting ? '创建中...' : '提交创建'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <Separator />

      {/* Active rooms */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge className="bg-green-500/10 text-green-500 border border-green-500/20 py-0.5">
            活跃中
          </Badge>
          <span className="text-sm text-muted-foreground">
            当前：{activeRooms.length} / 10 个房间
          </span>
        </div>

        {activeRooms.length === 0 ? (
          <Card className="border-border bg-card/40 flex flex-col items-center justify-center p-12 text-center">
            <MessageSquare className="size-12 text-muted-foreground/40 mb-3" />
            <p className="font-semibold text-lg">目前没有活跃的聊天房</p>
            <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-4">
              还没有人发起聊天房。点击右上角“发起聊天房”创建一个吧！
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeRooms.map((room) => {
              const isOwner = currentUser && String(currentUser.id) === room.creatorId;
              const isAdmin =
                currentUser &&
                (currentUser.role === 'superadmin' ||
                  currentUser.role === 'admin' ||
                  currentUser.role === 'moderator');

              return (
                <Link key={room.id} href={`/chatrooms/${room.uid}`}>
                  <Card className="border-border bg-card hover:bg-accent/40 transition-all cursor-pointer group flex flex-col justify-between h-[190px]">
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-start justify-between gap-3">
                        <Avatar className="size-10 border border-border shrink-0">
                          {room.avatarUrl ? (
                            <AvatarImage src={room.avatarUrl} alt={room.title} />
                          ) : null}
                          <AvatarFallback className="bg-muted text-orange-500 font-semibold text-sm">
                            {room.title.substring(0, 2)}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex flex-col gap-1 items-end">
                          <Badge
                            variant="secondary"
                            className="text-[10px] py-0 px-2 flex items-center gap-1 font-medium bg-muted text-muted-foreground border border-border"
                          >
                            <Clock className="size-3" />
                            {getRemainingTime(room.expiresAt)}
                          </Badge>
                          {(isOwner || isAdmin) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full"
                              onClick={(e) => handleCloseRoom(room.uid, e)}
                              title="关闭聊天房"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      <CardTitle className="text-base line-clamp-1 group-hover:text-orange-500 transition-colors mt-2">
                        {room.title}
                      </CardTitle>
                      {room.description && (
                        <CardDescription className="text-xs line-clamp-2 mt-1">
                          {room.description}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Users className="size-3.5" />
                        <span>{room.participantCount} 人在线</span>
                      </div>
                      <div className="text-[10px]">
                        发起人: <span className="font-medium">{room.creatorUsername}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
