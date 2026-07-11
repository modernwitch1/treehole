'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Loader2, CheckCircle2, Upload, Mail, Hash } from 'lucide-react';
import { submitRegistration, uploadScreenshot, verifyEmailCode } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type RegMethod = 'email' | 'screenshot';
type Step = 'form' | 'verifying' | 'submitting' | 'done';

function getPasswordStrength(password: string) {
  const checks = [
    password.length >= 8,
    /[A-Za-z]/.test(password) && /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
    /[a-z]/.test(password) && /[A-Z]/.test(password),
  ];
  const score = checks.filter(Boolean).length;

  if (!password) {
    return { score: 0, label: '未输入', color: 'bg-muted-foreground/30' };
  }
  if (score <= 1) {
    return { score, label: '弱', color: 'bg-destructive' };
  }
  if (score <= 3) {
    return { score, label: '中', color: 'bg-amber-500' };
  }
  return { score, label: '强', color: 'bg-green-500' };
}

export default function RegisterPage() {
  const [method, setMethod] = React.useState<RegMethod>('email');
  const [step, setStep] = React.useState<Step>('form');
  const [studentId, setStudentId] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [realName, setRealName] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [code, setCode] = React.useState('');
  const [result, setResult] = React.useState<{ message: string } | null>(null);
  const [codeError, setCodeError] = React.useState('');
  const passwordStrength = React.useMemo(() => getPasswordStrength(password), [password]);

  // ============================================================
  // 提交注册（第一阶段）
  // ============================================================
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId.trim()) {
      toast.error('请填写学号');
      return;
    }
    if (method === 'email' && !email.trim().toLowerCase().endsWith('@pop.zjgsu.edu.cn')) {
      toast.error('请使用 @pop.zjgsu.edu.cn 邮箱');
      return;
    }
    if (!password.trim() || password.length < 8) {
      toast.error('密码至少 8 位');
      return;
    }
    if (passwordStrength.score < 2) {
      toast.error('密码强度过弱,请使用字母和数字组合');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('两次输入的密码不一致');
      return;
    }
    if (method === 'screenshot' && !realName.trim()) {
      toast.error('请填写姓名');
      return;
    }
    if (method === 'screenshot' && !file) {
      toast.error('请上传个人档案截图');
      return;
    }

    setStep('submitting');

    try {
      let screenshotUrl: string | undefined;
      if (method === 'screenshot' && file) {
        const res = await uploadScreenshot(file);
        screenshotUrl = res.url;
      }

      await submitRegistration({
        studentId: studentId.trim(),
        email: method === 'email' ? email.trim() : undefined,
        password,
        realName: method === 'screenshot' ? realName.trim() : undefined,
        method,
        screenshotUrl,
      });

      if (method === 'email') {
        setStep('verifying');
        setResult({
          message: '验证码已发送到你的校园邮箱,请查收',
        });
      } else {
        setResult({
          message:
            '注册申请已提交,请等待管理员审批（通常 24h 内完成）。你可以在登录页输入学号和密码查看审批进度。',
        });
        setStep('done');
      }
    } catch {
      toast.error('提交失败,请重试');
      setStep('form');
    }
  }

  // ============================================================
  // 验证邮箱验证码
  // ============================================================
  async function handleVerifyCode() {
    if (!code.trim() || code.trim().length !== 6) {
      setCodeError('请输入 6 位验证码');
      return;
    }
    setCodeError('');
    try {
      const res = await verifyEmailCode(studentId.trim(), code.trim());
      if (!res.ok) {
        setCodeError(res.message ?? '验证码错误');
        return;
      }
      setResult({ message: '邮箱验证成功!你的账号已激活,请前往登录。' });
      setStep('done');
    } catch {
      toast.error('验证失败,请重试');
    }
  }

  // ============================================================
  // 完成界面
  // ============================================================
  if (step === 'done' && result) {
    return (
      <Card className="border-border/60 shadow-card">
        <CardHeader className="space-y-2 text-center">
          <Image
            src="/logo.webp"
            alt="浙工商树洞"
            width={48}
            height={48}
            priority
            className="mx-auto size-12 select-none lg:hidden"
          />
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-green-500/10">
            <CheckCircle2 className="size-6 text-green-500" />
          </div>
          <CardTitle className="text-2xl tracking-tight">提交成功</CardTitle>
          <CardDescription>{result.message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full" asChild>
            <Link href="/login">前往登录</Link>
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <Link href="/">返回首页</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ============================================================
  // 验证码输入界面
  // ============================================================
  if (step === 'verifying') {
    return (
      <Card className="border-border/60 shadow-card">
        <CardHeader className="space-y-2 text-center">
          <Image
            src="/logo.webp"
            alt="浙工商树洞"
            width={48}
            height={48}
            priority
            className="mx-auto size-12 select-none lg:hidden"
          />
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Hash className="size-6 text-primary" />
          </div>
          <CardTitle className="text-2xl tracking-tight">验证邮箱</CardTitle>
          <CardDescription>
            验证码已发送到 <span className="font-medium">{email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">验证码</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setCodeError('');
              }}
              placeholder="6 位数字验证码"
              maxLength={6}
              inputMode="numeric"
              className="text-center text-lg tracking-[0.5em]"
            />
            {codeError && <p className="text-sm text-destructive">{codeError}</p>}
          </div>
          <Button className="w-full" onClick={handleVerifyCode}>
            确认验证
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setStep('form');
              setResult(null);
              setCode('');
            }}
          >
            返回修改
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ============================================================
  // 注册表单
  // ============================================================
  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader className="space-y-2 text-center">
        <Image
          src="/logo.webp"
          alt="浙工商树洞"
          width={48}
          height={48}
          priority
          className="mx-auto size-12 select-none lg:hidden"
        />
        <CardTitle className="text-2xl tracking-tight">加入浙工商树洞</CardTitle>
        <CardDescription>仅限浙商大学生 · 需验证身份</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6 flex gap-2 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setMethod('email')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              method === 'email'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Mail className="size-4" />
            邮箱验证
          </button>
          <button
            type="button"
            onClick={() => setMethod('screenshot')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              method === 'screenshot'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Upload className="size-4" />
            截图审批
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
            用户名由系统自动分配,格式为“浙小商”加六位随机字母数字；头像统一使用树洞默认头像。
          </p>

          <div className="space-y-2">
            <Label htmlFor="studentId">学号</Label>
            <Input
              id="studentId"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="20231234001"
              required
            />
          </div>

          {method === 'email' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="email">校园邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="20231234001@pop.zjgsu.edu.cn"
                  required
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="realName">姓名</Label>
              <Input
                id="realName"
                value={realName}
                onChange={(e) => setRealName(e.target.value)}
                placeholder="用于身份核验"
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            <div className="space-y-1.5">
              <div className="flex h-1.5 gap-1">
                {Array.from({ length: 4 }).map((_, index) => (
                  <span
                    key={index}
                    className={cn(
                      'h-full flex-1 rounded-full bg-muted',
                      index < passwordStrength.score && passwordStrength.color,
                    )}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                密码强度：
                <span className="font-medium text-foreground">{passwordStrength.label}</span>
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">确认密码</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
            {confirmPassword && password !== confirmPassword && (
              <p className="text-xs text-destructive">两次输入的密码不一致</p>
            )}
          </div>

          {method === 'screenshot' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>个人数字档案截图</Label>
                <div className="flex items-center gap-3 rounded-lg border border-dashed border-input p-4">
                  <Upload className="size-5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 text-sm">
                    {file ? (
                      <span className="text-foreground">{file.name}</span>
                    ) : (
                      <span className="text-muted-foreground">上传我的商大个人数字档案截图</span>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('screenshot-upload')?.click()}
                  >
                    选择文件
                  </Button>
                  <input
                    id="screenshot-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  请确保截图清晰可辨认学号和姓名,管理员审核通过后即可激活账号
                </p>
              </div>
              <p className="rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                截图审批仅给暂时无法使用校园邮箱服务的用户使用。
              </p>
            </div>
          )}

          <Separator />

          <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <input id="terms" type="checkbox" className="mt-0.5" required />
            <Label htmlFor="terms" className="text-xs font-normal leading-relaxed">
              我已阅读并同意《
              <Link href="/terms" className="text-foreground hover:underline">
                用户协议
              </Link>
              》和《
              <Link href="/privacy" className="text-foreground hover:underline">
                隐私政策
              </Link>
              》
            </Label>
          </div>

          <Button type="submit" className="w-full" disabled={step === 'submitting'}>
            {step === 'submitting' && <Loader2 className="mr-2 size-4 animate-spin" />}
            {step === 'submitting'
              ? '提交中…'
              : method === 'email'
                ? '发送验证邮件'
                : '提交注册申请'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          已有账号?{' '}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            登录
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
