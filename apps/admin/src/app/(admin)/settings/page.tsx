'use client';

import * as React from 'react';
import { BellRing, Copy, ExternalLink, Loader2, Send, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  confirmAdmin2fa,
  disableAdmin2fa,
  getAdmin2faStatus,
  getCurrentAdmin,
  listAnnouncements,
  publishAnnouncement,
  setupAdmin2fa,
} from '@/lib/api';
import { relativeTime } from '@/lib/format';
import type { SystemAnnouncement } from '@/types/admin';

export default function SettingsPage() {
  const [announcements, setAnnouncements] = React.useState<SystemAnnouncement[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [linkUrl, setLinkUrl] = React.useState('');
  const [canPublish, setCanPublish] = React.useState(false);
  const [twoFactor, setTwoFactor] = React.useState<{
    enabled: boolean;
    personalEnabled: boolean;
    systemFallback: boolean;
  } | null>(null);
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [totpSetup, setTotpSetup] = React.useState<{
    secret: string;
    provisioningUri: string;
  } | null>(null);
  const [totpCode, setTotpCode] = React.useState('');
  const [twoFactorBusy, setTwoFactorBusy] = React.useState(false);

  const reload = React.useCallback(() => {
    setLoading(true);
    listAnnouncements({ pageSize: 50 })
      .then((res) => setAnnouncements(res.items))
      .catch((err) => toast.error((err as Error).message ?? '加载通知失败'))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    getCurrentAdmin()
      .then((admin) => {
        const allowed = admin?.role === 'superadmin';
        setCanPublish(allowed);
        if (allowed) reload();
        else setLoading(false);
      })
      .catch(() => {
        setCanPublish(false);
        setLoading(false);
      });
  }, [reload]);

  React.useEffect(() => {
    getAdmin2faStatus()
      .then(setTwoFactor)
      .catch(() => setTwoFactor(null));
  }, []);

  async function beginTwoFactorSetup() {
    if (!currentPassword) return;
    setTwoFactorBusy(true);
    try {
      const result = await setupAdmin2fa(currentPassword);
      setTotpSetup(result);
      setCurrentPassword('');
      setTotpCode('');
    } catch (error) {
      toast.error((error as Error).message || '无法开始二次验证设置');
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function confirmTwoFactorSetup() {
    if (!/^\d{6}$/.test(totpCode)) return;
    setTwoFactorBusy(true);
    try {
      const result = await confirmAdmin2fa(totpCode);
      toast.success(result.message);
      setTotpSetup(null);
      if (result.requiresRelogin) window.location.reload();
      else setTwoFactor(await getAdmin2faStatus());
    } catch (error) {
      toast.error((error as Error).message || '验证码错误');
    } finally {
      setTotpCode('');
      setTwoFactorBusy(false);
    }
  }

  async function disableTwoFactor() {
    if (!/^\d{6}$/.test(totpCode)) return;
    if (!confirm('确认移除个人二次验证？该操作会撤销所有后台登录会话。')) return;
    setTwoFactorBusy(true);
    try {
      const result = await disableAdmin2fa(totpCode);
      toast.success(result.message);
      if (result.requiresRelogin) window.location.reload();
      else setTwoFactor(await getAdmin2faStatus());
    } catch (error) {
      toast.error((error as Error).message || '无法移除二次验证');
    } finally {
      setTotpCode('');
      setTwoFactorBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.error('请填写通知标题和内容');
      return;
    }
    setSubmitting(true);
    try {
      const result = await publishAnnouncement({
        title: title.trim(),
        body: body.trim(),
        linkUrl: linkUrl.trim() || undefined,
      });
      setAnnouncements((items) => [result.announcement, ...items]);
      setTitle('');
      setBody('');
      setLinkUrl('');
      toast.success(`已发送给 ${result.announcement.recipientCount} 个用户`);
    } catch (err) {
      toast.error((err as Error).message ?? '发布失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">站点设置</h1>
        <p className="text-sm text-muted-foreground">
          {canPublish ? '账号安全 / 发布站内通知 / 查看通知历史' : '管理个人账号与登录安全'}
        </p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" /> 管理员二次验证
            </CardTitle>
            <Badge variant={twoFactor?.personalEnabled ? 'success' : 'warning'}>
              {twoFactor?.personalEnabled ? '个人 2FA 已启用' : '尚未启用个人 2FA'}
            </Badge>
          </div>
          <CardDescription>
            后台登录可启用动态验证码。设置或移除后，所有后台会话会立即失效并要求重新登录；
            超级管理员的身份调阅另由服务端自动记录完整审计。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {twoFactor?.systemFallback && !twoFactor.personalEnabled && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              当前仅使用系统级应急验证码。请尽快绑定个人验证器，避免多人共享同一密钥。
            </p>
          )}

          {!twoFactor?.personalEnabled && !totpSetup && (
            <div className="flex max-w-lg flex-col gap-2 sm:flex-row">
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="输入当前管理员密码以开始绑定"
                autoComplete="current-password"
              />
              <Button
                type="button"
                disabled={!currentPassword || twoFactorBusy}
                onClick={() => void beginTwoFactorSetup()}
              >
                {twoFactorBusy && <Loader2 className="animate-spin" />}
                生成个人密钥
              </Button>
            </div>
          )}

          {totpSetup && !twoFactor?.personalEnabled && (
            <div className="max-w-xl space-y-3 rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">1. 在验证器应用中手动添加以下密钥</p>
                <div className="mt-2 flex items-center gap-2 rounded-md bg-muted p-3">
                  <code className="min-w-0 flex-1 break-all text-sm">{totpSetup.secret}</code>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      void navigator.clipboard.writeText(totpSetup.secret);
                      toast.success('密钥已复制');
                    }}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
              <p className="break-all text-xs text-muted-foreground">
                配置 URI：{totpSetup.provisioningUri}
              </p>
              <div className="space-y-2">
                <Label htmlFor="totp-confirm-code">2. 输入验证器生成的 6 位动态码</Label>
                <div className="flex gap-2">
                  <Input
                    id="totp-confirm-code"
                    value={totpCode}
                    onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                  />
                  <Button
                    type="button"
                    disabled={!/^\d{6}$/.test(totpCode) || twoFactorBusy}
                    onClick={() => void confirmTwoFactorSetup()}
                  >
                    确认并重新登录
                  </Button>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                disabled={twoFactorBusy}
                onClick={() => {
                  setTotpSetup(null);
                  setTotpCode('');
                }}
              >
                取消并清除本页密钥
              </Button>
            </div>
          )}

          {twoFactor?.personalEnabled && (
            <div className="max-w-lg space-y-2">
              <Label htmlFor="totp-disable-code">移除个人 2FA（需要当前动态码）</Label>
              <div className="flex gap-2">
                <Input
                  id="totp-disable-code"
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                />
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!/^\d{6}$/.test(totpCode) || twoFactorBusy}
                  onClick={() => void disableTwoFactor()}
                >
                  移除并退出全部会话
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {canPublish && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BellRing className="size-4" /> 发布首页通知
              </CardTitle>
              <CardDescription>
                通知会同步进入树洞首页顶部导航栏的铃铛通知，下发给所有活跃用户。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="announcement-title">标题</Label>
                  <Input
                    id="announcement-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={120}
                    placeholder="例如：期末周树洞使用提醒"
                  />
                  <p className="text-right text-xs text-muted-foreground">{title.length} / 120</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="announcement-body">内容</Label>
                  <textarea
                    id="announcement-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    maxLength={1000}
                    rows={8}
                    placeholder="写给全体用户的通知内容"
                    className="block w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <p className="text-right text-xs text-muted-foreground">{body.length} / 1000</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="announcement-link">跳转链接</Label>
                  <Input
                    id="announcement-link"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="/rules 或 https://unidating.top/rules"
                  />
                </div>

                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? <Loader2 className="animate-spin" /> : <Send />}
                  发布通知
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">通知历史</CardTitle>
              <CardDescription>最近 50 条后台发布的全站通知。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div>
              ) : announcements.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">暂无通知</div>
              ) : (
                announcements.map((announcement) => (
                  <article key={announcement.id} className="rounded-lg border bg-muted/20 p-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <h2 className="line-clamp-1 text-sm font-semibold">{announcement.title}</h2>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                          {announcement.body}
                        </p>
                      </div>
                      <Badge variant="muted" className="shrink-0">
                        {announcement.recipientCount} 人
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>{relativeTime(announcement.createdAt)}</span>
                      <span>发布人: {announcement.publishedBy}</span>
                      {announcement.linkUrl && (
                        <a
                          href={announcement.linkUrl}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-1 text-primary"
                        >
                          查看链接 <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  </article>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
