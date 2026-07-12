'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  MessageSquare,
  Clock,
  Users,
  ShieldAlert,
  Flag,
  CheckCircle,
  Ban,
  ChevronRight,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import {
  adminGetChatrooms,
  adminGetChatroomMessages,
  adminFlagMessage,
  adminCloseChatroom,
  adminGetFlaggedMessages,
  type ChatroomDetail,
  type ChatroomMessageDto,
  type AdminFlaggedMessageDto,
} from '@/lib/api';
import { toast } from 'sonner';

export default function AdminChatroomsPage() {
  const [rooms, setRooms] = React.useState<ChatroomDetail[]>([]);
  const [selectedRoomUid, setSelectedRoomUid] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatroomMessageDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [messagesLoading, setMessagesLoading] = React.useState(false);
  const [tab, setTab] = React.useState<'active' | 'historical' | 'flagged'>('active');
  const [flaggedMessages, setFlaggedMessages] = React.useState<AdminFlaggedMessageDto[]>([]);
  const [selectedMsgId, setSelectedMsgId] = React.useState<string | null>(null);
  const roomsRequestInFlightRef = React.useRef(false);
  const flaggedRequestInFlightRef = React.useRef(false);
  const messageRequestsInFlightRef = React.useRef(new Set<string>());
  const selectedRoomUidRef = React.useRef<string | null>(null);
  const lastMessageIdsRef = React.useRef(new Map<string, string>());

  React.useEffect(() => {
    selectedRoomUidRef.current = selectedRoomUid;
  }, [selectedRoomUid]);

  const activeRooms = rooms.filter((r) => r.isActive);
  const inactiveRooms = rooms.filter((r) => !r.isActive);
  const selectedRoomIsActive =
    rooms.find((room) => room.uid === selectedRoomUid)?.isActive ?? false;

  const loadRooms = React.useCallback(async () => {
    if (roomsRequestInFlightRef.current) return;
    roomsRequestInFlightRef.current = true;
    try {
      const data = await adminGetChatrooms();
      setRooms(data);
    } catch {
      toast.error('加载监控数据失败');
    } finally {
      roomsRequestInFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  const loadFlaggedMessages = React.useCallback(async () => {
    if (flaggedRequestInFlightRef.current) return;
    flaggedRequestInFlightRef.current = true;
    try {
      setFlaggedMessages(await adminGetFlaggedMessages());
    } catch {
      toast.error('加载已标记消息失败');
    } finally {
      flaggedRequestInFlightRef.current = false;
    }
  }, []);

  const loadMessages = React.useCallback(async (uid: string, forceFull = false) => {
    if (messageRequestsInFlightRef.current.has(uid)) return;
    messageRequestsInFlightRef.current.add(uid);
    try {
      const afterId = forceFull ? undefined : lastMessageIdsRef.current.get(uid);
      const msgs = await adminGetChatroomMessages(uid, afterId);
      if (selectedRoomUidRef.current !== uid) return;
      setMessages((current) => {
        const next = afterId
          ? [...new Map([...current, ...msgs].map((message) => [message.id, message])).values()]
          : msgs;
        const unchanged =
          current.length === next.length &&
          current.every(
            (message, index) =>
              message.id === next[index]?.id &&
              message.content === next[index]?.content &&
              message.isFlagged === next[index]?.isFlagged &&
              message.moderationStatus === next[index]?.moderationStatus &&
              message.senderIp === next[index]?.senderIp &&
              message.realSender?.userId === next[index]?.realSender?.userId,
          );
        return unchanged ? current : next;
      });
      if (msgs.length > 0) lastMessageIdsRef.current.set(uid, msgs[msgs.length - 1].id);
    } catch {
      // quiet fail on polling
    } finally {
      messageRequestsInFlightRef.current.delete(uid);
    }
  }, []);

  // Poll only while the admin tab is visible and never overlap full monitor snapshots.
  React.useEffect(() => {
    const poll = () => {
      if (document.visibilityState === 'visible') void loadRooms();
    };
    const handleVisibilityChange = () => poll();

    poll();
    const interval = window.setInterval(poll, 15_000);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadRooms]);

  // Flagged-message identity snapshots are loaded once and on explicit user
  // actions. This avoids generating repetitive trace-access audit events from
  // a background poll while the page is merely left open.
  React.useEffect(() => {
    void loadFlaggedMessages();
  }, [loadFlaggedMessages]);

  // Active rooms refresh every 5s. Historical rooms are immutable, so one load is enough.
  React.useEffect(() => {
    if (!selectedRoomUid) {
      setMessages([]);
      return;
    }

    lastMessageIdsRef.current.delete(selectedRoomUid);
    setMessages([]);
    let disposed = false;
    const poll = () => {
      if (document.visibilityState !== 'visible') return;
      void loadMessages(selectedRoomUid).finally(() => {
        if (!disposed) setMessagesLoading(false);
      });
    };
    const handleVisibilityChange = () => poll();

    setMessagesLoading(true);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    poll();
    if (!selectedRoomIsActive) {
      return () => {
        disposed = true;
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }

    const interval = window.setInterval(poll, 5_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [selectedRoomUid, selectedRoomIsActive, loadMessages]);

  const handleCloseRoom = async (uid: string) => {
    if (!confirm('确定要强行关闭该聊天房吗？关闭后用户将无法在其中发言。')) return;

    try {
      await adminCloseChatroom(uid);
      toast.success('已强行关闭该聊天房');
      loadRooms();
    } catch {
      toast.error('关闭聊天房失败');
    }
  };

  const handleFlagMessage = async (msgId: string) => {
    if (
      !confirm(
        '确定将该消息隔离并转入统一审核案件吗？消息证据会被保全；只有超级管理员能直接查看真实身份。',
      )
    )
      return;

    try {
      await adminFlagMessage(msgId);
      toast.success('已隔离消息并转入统一审核队列');
      void loadFlaggedMessages();
      if (selectedRoomUid) {
        loadMessages(selectedRoomUid, true);
      }
    } catch {
      toast.error('标记言论失败');
    }
  };

  const getRemainingTime = (expiresAtStr: string) => {
    const remainingMs = new Date(expiresAtStr).getTime() - Date.now();
    if (remainingMs <= 0) return '已过期';
    const hours = Math.floor(remainingMs / (3600 * 1000));
    const minutes = Math.floor((remainingMs % (3600 * 1000)) / (60 * 1000));
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const selectedRoom = rooms.find((r) => r.uid === selectedRoomUid);

  if (loading && rooms.length === 0) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">聊天房实时监控</h1>
        <p className="text-sm text-muted-foreground mt-1">
          普通管理员和审核员始终只看到匿名昵称；超级管理员可直接溯源，每次身份数据读取都会自动留下审计记录。
        </p>
      </div>

      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-14rem)] min-h-[500px]">
        {/* Left Panel: Rooms List (Tabs for Active vs Historical vs Flagged) */}
        <Card className="md:col-span-1 border-sidebar-border bg-sidebar flex flex-col overflow-hidden">
          <CardHeader className="p-4 pb-2 shrink-0">
            <CardTitle className="text-sm font-semibold flex items-center justify-between mb-2">
              <span>聊天房监控</span>
            </CardTitle>

            {/* Tab toggle buttons */}
            <div className="flex bg-muted p-0.5 rounded-md w-full text-[10px] sm:text-xs">
              <button
                type="button"
                onClick={() => {
                  setTab('active');
                  setSelectedMsgId(null);
                }}
                className={`flex-1 text-center py-1 rounded-sm transition-all font-semibold ${
                  tab === 'active'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                活跃中 ({activeRooms.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('historical');
                  setSelectedMsgId(null);
                }}
                className={`flex-1 text-center py-1 rounded-sm transition-all font-semibold ${
                  tab === 'historical'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                历史关闭 ({inactiveRooms.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('flagged');
                  setSelectedRoomUid(null);
                  void loadFlaggedMessages();
                }}
                className={`flex-1 text-center py-1 rounded-sm transition-all font-semibold ${
                  tab === 'flagged'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                已标记 ({flaggedMessages.length})
              </button>
            </div>
          </CardHeader>
          <Separator className="bg-sidebar-border" />
          <ScrollArea className="flex-1 p-2">
            {tab === 'flagged' ? (
              flaggedMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-muted-foreground h-48">
                  <Flag className="size-8 text-muted-foreground/30 mb-2" />
                  <span>暂无被标记的违规言论</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {flaggedMessages.map((msg) => {
                    const isSelected = msg.id === selectedMsgId;
                    return (
                      <button
                        key={msg.id}
                        onClick={() => {
                          setSelectedMsgId(msg.id);
                          setSelectedRoomUid(null);
                        }}
                        className={`w-full text-left p-3 rounded-lg transition-colors flex flex-col gap-1 border group ${
                          isSelected
                            ? 'bg-destructive/10 border-destructive/20 text-destructive font-medium'
                            : 'hover:bg-accent hover:text-accent-foreground text-muted-foreground border-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs font-semibold text-foreground truncate max-w-[120px]">
                            {msg.realSender?.username ?? msg.senderNickname}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-foreground font-normal line-clamp-1 break-all">
                          {msg.content}
                        </p>
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
                          <span>
                            {msg.realSender
                              ? `学号 ${msg.realSender.studentId ?? '未关联'} · IP ${msg.senderIp ?? '未记录'}`
                              : msg.caseId
                                ? `案件 #${msg.caseId}`
                                : '待转入审核案件'}
                          </span>
                          <span className="text-[9px] bg-muted px-1 rounded-sm truncate max-w-[100px]">
                            {msg.chatroomTitle}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )
            ) : (tab === 'active' ? activeRooms : inactiveRooms).length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-muted-foreground h-48">
                <MessageSquare className="size-8 text-muted-foreground/30 mb-2" />
                <span>当前没有{tab === 'active' ? '活跃' : '关闭'}的聊天房</span>
              </div>
            ) : (
              <div className="space-y-1">
                {(tab === 'active' ? activeRooms : inactiveRooms).map((room) => {
                  const isSelected = room.uid === selectedRoomUid;
                  return (
                    <button
                      key={room.id}
                      onClick={() => {
                        setSelectedRoomUid(room.uid);
                        setSelectedMsgId(null);
                      }}
                      className={`w-full text-left p-3 rounded-lg transition-colors flex items-center justify-between group ${
                        isSelected
                          ? 'bg-primary/15 text-primary font-medium'
                          : 'hover:bg-accent hover:text-accent-foreground text-muted-foreground'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                          {room.title}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs">
                          <span className="flex items-center gap-1">
                            <Users className="size-3" />
                            {room.participantCount}人
                          </span>
                          {room.isActive ? (
                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Clock className="size-3" />
                              {getRemainingTime(room.expiresAt)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-destructive bg-destructive/10 px-1 rounded-sm">
                              已关闭
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="size-4 opacity-50 shrink-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </Card>

        {/* Right Panel: Live Monitoring Stream */}
        <Card className="md:col-span-2 border-sidebar-border bg-sidebar flex flex-col overflow-hidden">
          {selectedRoom ? (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Monitoring Header */}
              <div className="p-4 border-b border-sidebar-border flex items-center justify-between shrink-0 bg-accent/20">
                <div className="min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground truncate">
                      {selectedRoom.title}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] border-primary/20 text-primary py-0 bg-primary/5"
                    >
                      UID: {selectedRoom.uid}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-1">
                    创建人: {selectedRoom.creatorUsername} | 创建时间:{' '}
                    {new Date(selectedRoom.createdAt).toLocaleString()}
                  </p>
                </div>
                {selectedRoom.isActive ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleCloseRoom(selectedRoom.uid)}
                    className="shrink-0 h-8 text-xs font-semibold"
                  >
                    <Ban className="size-3.5 mr-1" /> 强行关闭房间
                  </Button>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-xs text-muted-foreground border-border bg-muted/10 py-1 px-2 font-semibold"
                  >
                    已关闭 / 已过期
                  </Badge>
                )}
              </div>

              {/* Messages Stream */}
              <ScrollArea className="flex-1 p-4 bg-muted/10">
                {messagesLoading && messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center text-xs text-muted-foreground h-64">
                    <MessageSquare className="size-8 text-muted-foreground/30 mb-2" />
                    <span>该聊天房尚无发言言论</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex gap-3 items-start p-3 rounded-lg border transition-all ${
                          msg.isFlagged
                            ? 'bg-destructive/10 border-destructive/20'
                            : 'bg-card border-sidebar-border hover:border-sidebar-border-hover'
                        }`}
                      >
                        <Avatar className="size-8 border border-sidebar-border shrink-0 mt-0.5">
                          <AvatarImage src={msg.senderAvatar} />
                          <AvatarFallback>匿</AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0 space-y-1.5">
                          {/* Anonymous nickname, moderation state and timestamp */}
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-xs font-semibold text-foreground">
                              {msg.senderNickname}
                            </span>

                            <Badge
                              variant={msg.moderationStatus === 'published' ? 'outline' : 'warning'}
                              className="text-[10px] px-1.5 py-0"
                            >
                              {msg.moderationStatus === 'published' ? '公开可见' : '已隔离待审'}
                            </Badge>

                            <span className="text-[10px] text-muted-foreground">
                              {new Date(msg.createdAt).toLocaleTimeString()}
                            </span>
                          </div>

                          {msg.realSender && (
                            <div className="grid gap-x-4 gap-y-1 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] sm:grid-cols-2">
                              <span>
                                <strong className="text-primary">真实账号：</strong>
                                {msg.realSender.username}
                              </span>
                              <span>
                                <strong className="text-primary">学号：</strong>
                                {msg.realSender.studentId ?? '未关联学号记录'}
                              </span>
                              <span className="break-all">
                                <strong className="text-primary">邮箱：</strong>
                                {msg.realSender.email}
                              </span>
                              <span className="break-all">
                                <strong className="text-primary">IP：</strong>
                                {msg.senderIp ?? '未记录'}
                              </span>
                            </div>
                          )}

                          {/* Message Content */}
                          <p className="text-sm text-foreground whitespace-pre-wrap break-all leading-normal">
                            {msg.content}
                          </p>
                        </div>

                        {/* Action: Flag Message */}
                        <div className="shrink-0">
                          {msg.isFlagged ? (
                            <Badge
                              variant="outline"
                              className="text-xs text-green-500 border-green-500/20 bg-green-500/5 px-2 py-0.5 flex items-center gap-1"
                            >
                              <CheckCircle className="size-3" />
                              <span>已标记审计</span>
                            </Badge>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleFlagMessage(msg.id)}
                              className="h-8 text-xs border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
                            >
                              <Flag className="size-3.5 mr-1" /> 标记违规
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          ) : selectedMsgId && tab === 'flagged' ? (
            (() => {
              const msg = flaggedMessages.find((m) => m.id === selectedMsgId);
              if (!msg) return null;
              return (
                <div className="p-6 space-y-6 overflow-y-auto h-full flex flex-col justify-between">
                  <div className="space-y-6">
                    {/* Header */}
                    <div className="flex items-center gap-3 border-b border-border pb-4">
                      <div className="h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive flex">
                        <ShieldAlert className="size-5" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-foreground">违规言论审计报告</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {msg.realSender
                            ? '此消息已被隔离；本次超级管理员身份调阅已自动记入审计日志'
                            : '此消息已被隔离；当前权限仅显示房间内匿名昵称'}
                        </p>
                      </div>
                    </div>

                    {/* Detailed info grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1 bg-muted/30 p-3 rounded-lg border border-border/40">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                          用户昵称 (房间内)
                        </span>
                        <p className="text-sm font-semibold text-foreground">
                          {msg.senderNickname}
                        </p>
                      </div>

                      {msg.realSender && (
                        <>
                          <div className="space-y-1 rounded-lg border border-primary/20 bg-primary/5 p-3">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                              真实账号 / UID
                            </span>
                            <p className="text-sm font-semibold text-foreground">
                              {msg.realSender.username} / {msg.realSender.userId}
                            </p>
                          </div>
                          <div className="space-y-1 rounded-lg border border-primary/20 bg-primary/5 p-3">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                              学号
                            </span>
                            <p className="text-sm font-semibold text-foreground">
                              {msg.realSender.studentId ?? '未关联学号记录'}
                            </p>
                          </div>
                          <div className="space-y-1 rounded-lg border border-primary/20 bg-primary/5 p-3">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                              邮箱
                            </span>
                            <p className="break-all text-sm font-semibold text-foreground">
                              {msg.realSender.email}
                            </p>
                          </div>
                          <div className="space-y-1 rounded-lg border border-primary/20 bg-primary/5 p-3">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                              发送 IP
                            </span>
                            <p className="break-all text-sm font-semibold text-foreground">
                              {msg.senderIp ?? '未记录'}
                            </p>
                          </div>
                        </>
                      )}

                      <div className="space-y-1 bg-muted/30 p-3 rounded-lg border border-border/40">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                          关联审核案件
                        </span>
                        {msg.caseId ? (
                          <Button variant="link" className="h-auto p-0 text-sm" asChild>
                            <Link href={`/moderation?status=all&caseId=${msg.caseId}#case-${msg.caseId}`}>
                              案件 #{msg.caseId} · 前往复核
                            </Link>
                          </Button>
                        ) : (
                          <p className="text-sm text-muted-foreground">尚未关联，请重新执行“标记违规”</p>
                        )}
                      </div>

                      <div className="space-y-1 bg-muted/30 p-3 rounded-lg border border-border/40">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                          发布时间
                        </span>
                        <p className="text-sm text-foreground">
                          {new Date(msg.createdAt).toLocaleString()}
                        </p>
                      </div>

                      <div className="space-y-1 bg-muted/30 p-3 rounded-lg border border-border/40 sm:col-span-2">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                          所属聊天房
                        </span>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-sm font-semibold text-foreground">
                            {msg.chatroomTitle}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[10px] py-0 bg-accent/20 truncate max-w-[150px]"
                          >
                            UID: {msg.chatroomUid}
                          </Badge>
                        </div>
                      </div>

                      <div className="space-y-1 bg-destructive/5 p-4 rounded-lg border border-destructive/20 sm:col-span-2">
                        <span className="text-[10px] text-destructive uppercase font-bold tracking-wider">
                          言论详细内容
                        </span>
                        <p className="text-sm text-foreground whitespace-pre-wrap break-all leading-relaxed mt-1.5 font-medium">
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Footer status */}
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex items-center gap-2.5 text-xs text-green-700 dark:text-green-300 font-medium">
                    <CheckCircle className="size-4 shrink-0 text-green-500" />
                    <span>
                      {msg.realSender
                        ? '证据状态：消息已隔离并保留统一审核案件入口；溯源信息已自动留痕。'
                        : '证据状态：消息已隔离并保留统一审核案件入口；当前工作台未暴露真实身份。'}
                    </span>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground h-full">
              <AlertTriangle className="size-12 text-muted-foreground/30 mb-3" />
              <p className="font-semibold text-sm">尚未选择监控对象</p>
              <p className="text-xs text-muted-foreground mt-1">
                {tab === 'flagged'
                  ? '请从左侧列表中点击一个被标记的违规言论以调阅详细审计报告。'
                  : '请从左侧列表中点击一个聊天房查看言论；超级管理员会同时看到发送者溯源信息。'}
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
