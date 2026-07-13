'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Send, Clock, Loader2, Flag, AlertCircle, Ban } from 'lucide-react';
import {
  getChatroomDetail,
  getChatroomMessages,
  sendChatroomMessage,
  closeChatroom,
  getCurrentUser,
} from '@/lib/api';
import type { ChatroomDetail, ChatroomMessageDto, CurrentUser } from '@/types/api';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { CommunitySafetyNotice } from '@/components/community-safety-notice';
import { ReportDialog } from '@/components/report-dialog';

export default function ChatroomPage() {
  const params = useParams();
  const router = useRouter();
  const uid = params.uid as string;

  const [room, setRoom] = React.useState<ChatroomDetail | null>(null);
  const [messages, setMessages] = React.useState<ChatroomMessageDto[]>([]);
  const [currentUser, setCurrentUser] = React.useState<CurrentUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [text, setText] = React.useState('');
  const [showWarningModal, setShowWarningModal] = React.useState(false);
  const [rulesAcknowledged, setRulesAcknowledged] = React.useState(false);
  const hasNotifiedRef = React.useRef(false);
  const messagesRequestInFlightRef = React.useRef(false);
  const roomStatusRequestInFlightRef = React.useRef(false);
  const lastMessageIdRef = React.useRef<string | undefined>(undefined);
  const lastFullMessageRefreshAtRef = React.useRef(0);

  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    lastMessageIdRef.current = undefined;
    lastFullMessageRefreshAtRef.current = 0;
    setMessages([]);
  }, [uid]);

  const fetchRoomDetail = React.useCallback(async () => {
    try {
      const [detail, user] = await Promise.all([getChatroomDetail(uid), getCurrentUser()]);
      setRoom(detail);
      setCurrentUser(user);
    } catch {
      toast.error('获取聊天房详情失败');
      router.push('/chatrooms');
    } finally {
      setLoading(false);
    }
  }, [uid, router]);

  const fetchMessages = React.useCallback(
    async (forceFull = false) => {
      if (!uid || messagesRequestInFlightRef.current) return;
      messagesRequestInFlightRef.current = true;
      try {
        const afterId = forceFull ? undefined : lastMessageIdRef.current;
        const list = await getChatroomMessages(uid, afterId);
        setMessages((current) => {
          const next = afterId
            ? [...new Map([...current, ...list].map((message) => [message.id, message])).values()]
            : list;
          const unchanged =
            current.length === next.length &&
            current.every(
              (message, index) =>
                message.id === next[index]?.id &&
                message.content === next[index]?.content &&
                message.isFlagged === next[index]?.isFlagged,
            );
          return unchanged ? current : next;
        });
        if (list.length > 0) lastMessageIdRef.current = list[list.length - 1].id;
      } catch {
        // quiet fail on polling
      } finally {
        messagesRequestInFlightRef.current = false;
      }
    },
    [uid],
  );

  const refreshRoomStatus = React.useCallback(async () => {
    if (!uid || roomStatusRequestInFlightRef.current) return;
    roomStatusRequestInFlightRef.current = true;
    try {
      setRoom(await getChatroomDetail(uid));
    } catch {
      // quiet fail on polling
    } finally {
      roomStatusRequestInFlightRef.current = false;
    }
  }, [uid]);

  // Initial load
  React.useEffect(() => {
    fetchRoomDetail();
  }, [fetchRoomDetail]);

  // Handle welcome notification toast & user warning modal popup
  React.useEffect(() => {
    if (room && currentUser && !hasNotifiedRef.current) {
      hasNotifiedRef.current = true;
      toast(
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-foreground font-semibold text-xs">
            <Clock className="size-3.5 text-orange-500 animate-pulse" />
            <span>在线聊天房已开启</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-normal">
            本房间将于 {new Date(room.expiresAt).toLocaleTimeString()}{' '}
            自动关闭。所有发言均隐去真实身份。
          </p>
        </div>,
        {
          duration: 6000,
        },
      );

      setShowWarningModal(true);
    }
  }, [room, currentUser]);

  const roomId = room?.id;
  const roomIsActive = room?.isActive ?? false;

  // Poll only while this tab is visible. Message requests stay reasonably fresh,
  // while room status needs a much lower refresh frequency than chat messages.
  React.useEffect(() => {
    if (!roomId) return;

    let lastRoomRefreshAt = Date.now();
    const poll = () => {
      if (document.visibilityState !== 'visible') return;
      const forceFull = Date.now() - lastFullMessageRefreshAtRef.current >= 30_000;
      if (forceFull) lastFullMessageRefreshAtRef.current = Date.now();
      void fetchMessages(forceFull);
      if (roomIsActive && Date.now() - lastRoomRefreshAt >= 30_000) {
        lastRoomRefreshAt = Date.now();
        void refreshRoomStatus();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      lastRoomRefreshAt = 0;
      poll();
    };

    poll();
    if (!roomIsActive) return;

    const interval = window.setInterval(poll, 5_000);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [roomId, roomIsActive, fetchMessages, refreshRoomStatus]);

  // Scroll to bottom when messages length changes
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !room?.isActive || !rulesAcknowledged) return;

    const content = text.trim();
    setSending(true);

    try {
      const newMsg = await sendChatroomMessage(uid, content, rulesAcknowledged);
      setMessages((prev) => [...prev, newMsg]);
      setText('');
      setRulesAcknowledged(false);
      if (newMsg.moderationStatus === 'pending_review') {
        toast.info('发言已提交审核', {
          description: '审核通过前仅你自己可见，不会展示给房间内其他用户。',
        });
      }
    } catch (err) {
      toast.error((err as Error).message || '消息发送失败');
    } finally {
      setSending(false);
    }
  };

  const handleClose = async () => {
    if (!room) return;
    if (!confirm('确定要提前关闭这个聊天房吗？关闭后将无法再发言。')) return;
    try {
      await closeChatroom(uid);
      toast.success('聊天房已关闭');
      fetchRoomDetail();
    } catch (err) {
      toast.error((err as Error).message || '关闭失败');
    }
  };

  // Helper: calculate remaining time
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

  if (loading || !room) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="size-8 animate-spin text-orange-500" />
        <p className="text-sm text-muted-foreground">载入聊天室中...</p>
      </div>
    );
  }

  const isOwner = currentUser && String(currentUser.id) === room.creatorId;
  const isAdmin =
    currentUser &&
    (currentUser.role === 'superadmin' ||
      currentUser.role === 'admin' ||
      currentUser.role === 'moderator');

  return (
    <>
      <div className="flex flex-col h-[calc(100vh-6rem)] max-w-4xl mx-auto border border-border rounded-xl overflow-hidden bg-card shadow-lg">
        {/* Top Header */}
        <header className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="shrink-0 rounded-full" asChild>
              <Link href="/chatrooms">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>

            <Avatar className="size-10 border border-border shrink-0">
              {room.avatarUrl ? <AvatarImage src={room.avatarUrl} alt={room.title} /> : null}
              <AvatarFallback className="bg-orange-500/10 text-orange-500 font-semibold">
                {room.title.substring(0, 2)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-sm truncate max-w-[200px] sm:max-w-md">
                  {room.title}
                </h1>
                {room.isActive ? (
                  <Badge className="bg-green-500/10 text-green-500 border border-green-500/20 text-[10px] px-1.5 py-0">
                    进行中
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-muted-foreground text-[10px] px-1.5 py-0"
                  >
                    已关闭
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate max-w-[250px] sm:max-w-xl">
                {room.description || '无房间简介'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {room.isActive && (
              <Badge
                variant="secondary"
                className="text-xs px-2 flex items-center gap-1 font-medium bg-muted text-muted-foreground border border-border"
              >
                <Clock className="size-3.5" />
                <span>{getRemainingTime(room.expiresAt)}</span>
              </Badge>
            )}

            {(isOwner || isAdmin) && room.isActive && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
                onClick={handleClose}
              >
                关闭聊天房
              </Button>
            )}
          </div>
        </header>

        {/* Main Chat Panel */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-4 bg-cover bg-center bg-no-repeat relative"
          style={{
            backgroundImage: room.backgroundUrl ? `url('${room.backgroundUrl}')` : 'none',
          }}
        >
          {/* Background Mask */}
          {room.backgroundUrl && (
            <div className="absolute inset-0 bg-background/85 backdrop-blur-[1px] z-0" />
          )}

          <div className="relative z-10 flex flex-col justify-end min-h-full">
            {messages.length === 0 ? (
              <div className="text-center py-12 text-xs text-muted-foreground">
                暂无言论。在下方输入并发送开始交流吧。
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => {
                  const isMyMessage = msg.isMine === true;
                  const isPending = msg.moderationStatus === 'pending_review';

                  return (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-2.5 ${isMyMessage ? 'flex-row-reverse' : ''}`}
                    >
                      <Avatar className="size-8 border border-border shrink-0 mt-0.5">
                        <AvatarImage src={msg.senderAvatar} alt={msg.senderNickname} />
                        <AvatarFallback className="bg-muted text-xs">匿</AvatarFallback>
                      </Avatar>

                      <div
                        className={`flex flex-col max-w-[80%] ${isMyMessage ? 'items-end' : 'items-start'}`}
                      >
                        {/* Sender Nickname & Admin details */}
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[11px] font-semibold text-muted-foreground">
                            {msg.senderNickname}
                          </span>

                          {isPending && isMyMessage && (
                            <Badge
                              variant="outline"
                              className="border-amber-500/30 bg-amber-500/10 px-1 py-0 text-[9px] font-medium text-amber-700 dark:text-amber-300"
                            >
                              审核中 · 仅自己可见
                            </Badge>
                          )}
                        </div>

                        {/* Content Bubble */}
                        <div
                          className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-all shadow-sm ${
                            isPending
                              ? 'border border-amber-500/30 bg-amber-500/10 text-foreground'
                              : isMyMessage
                                ? 'bg-orange-500 text-white'
                                : 'bg-muted border border-border text-foreground'
                          }`}
                        >
                          {msg.content}
                        </div>

                        {/* Timestamp & Flag action */}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>

                          {!isMyMessage && (
                            <ReportDialog
                              targetType="chatroom_message"
                              targetId={msg.id}
                              title="举报这条聊天房消息"
                              trigger={
                                <button
                                  type="button"
                                  className="flex items-center gap-0.5 text-[10px] text-muted-foreground transition-colors hover:text-destructive"
                                >
                                  <Flag className="size-3" />
                                  <span>举报</span>
                                </button>
                              }
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={scrollRef} />
              </div>
            )}
          </div>
        </div>

        {/* Bottom Input Area */}
        <footer className="px-4 py-3 bg-muted/20 border-t border-border shrink-0">
          {room.isActive ? (
            <form onSubmit={handleSend} className="space-y-2">
              <CommunitySafetyNotice compact privateChannel />
              <div className="flex gap-2">
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="在聊天房内文明发言..."
                  maxLength={2000}
                  className="flex-1 bg-background border border-border focus-visible:ring-orange-500"
                  disabled={sending}
                  required
                />
                <Button
                  type="submit"
                  className="bg-orange-500 hover:bg-orange-600 text-white shrink-0 shadow-sm transition-transform active:scale-95"
                  disabled={sending || !text.trim() || !rulesAcknowledged}
                >
                  {sending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </div>
              <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                <input
                  type="checkbox"
                  checked={rulesAcknowledged}
                  onChange={(event) => setRulesAcknowledged(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  我确认本条发言遵守
                  <Link href="/rules" className="mx-1 font-medium underline underline-offset-4">
                    社区规则
                  </Link>
                  ，并知悉违规内容可能被拦截、处罚和依法依规溯源。
                </span>
              </label>
            </form>
          ) : (
            <div className="flex items-center justify-center gap-2 py-1.5 text-xs text-muted-foreground bg-muted/60 rounded-md border border-border">
              <Ban className="size-4 text-muted-foreground" />
              <span>此聊天房已关闭或过期，仅支持只读浏览。</span>
            </div>
          )}
        </footer>
      </div>

      {/* Safety Warning Modal for Ordinary Users */}
      <Dialog
        open={showWarningModal}
        onOpenChange={(nextOpen) => {
          if (nextOpen || rulesAcknowledged) setShowWarningModal(nextOpen);
        }}
      >
        <DialogContent
          hideCloseButton
          className="sm:max-w-md"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 mb-3">
              <AlertCircle className="size-6" />
            </div>
            <DialogTitle className="text-center text-base font-semibold text-foreground">
              聊天房文明规范与安全提示
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-muted-foreground">
              进入聊天房前请仔细阅读以下条款
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-xs leading-relaxed text-muted-foreground border-y border-border py-4 my-2">
            <p className="font-semibold text-foreground">
              欢迎加入聊天房！为维护健康绿色的校园交流环境，请遵守以下规定：
            </p>
            <ul className="list-disc pl-4 space-y-1.5">
              <li>
                <strong className="text-foreground">禁止违法言论：</strong>
                严禁发布任何违反国家法律法规、破坏社会稳定、传播淫秽色情或违禁内容。
              </li>
              <li>
                <strong className="text-foreground">禁止恶意攻击：</strong>
                严禁进行人身攻击、辱骂诽谤、散布谣言或泄露他人隐私。
              </li>
              <li>
                <strong className="text-foreground">匿名发言规则：</strong>
                聊天房内所有发言对其他普通用户是匿名的，系统会为您分配随机的匿名头像与昵称。
              </li>
              <li>
                <strong className="text-foreground">记录留存规则：</strong>
                聊天房关闭或过期不代表记录立即删除。常规记录默认留存 180 天，部署者可在 30–3650
                天范围内配置；标记为证据保全（legalHold）的记录不会被自动删除。
              </li>
              <li className="text-red-500 dark:text-red-400 font-medium">
                <strong>实名溯源机制：</strong>
                匿名仅面向普通用户。仅全站唯一超级管理员可通过受控权限进行溯源，且每次查询都会自动写入审计；普通管理员和版主无此权限。涉嫌违法违规时，平台可依法依规配合学校相关部门或有权机关调查。
              </li>
            </ul>
            <p className="pt-1 text-center">
              <Link
                href="/rules"
                className="font-medium text-foreground underline underline-offset-4"
              >
                查看完整社区规则、处罚与申诉说明
              </Link>
            </p>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button
              onClick={() => {
                setRulesAcknowledged(true);
                setShowWarningModal(false);
              }}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white shadow-sm font-medium"
            >
              我已阅读并同意遵守规则
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
