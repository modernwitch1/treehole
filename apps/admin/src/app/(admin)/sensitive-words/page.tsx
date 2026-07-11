'use client';

import * as React from 'react';
import {
  Plus,
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  Power,
  Shield,
  Filter as FilterIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  createSensitiveWord,
  deleteSensitiveWord,
  listSensitiveWords,
  reloadSensitiveWords,
  updateSensitiveWord,
} from '@/lib/api';
import { relativeTime } from '@/lib/format';
import type { SensitiveWord, SensitiveWordAction, SensitiveWordCategory } from '@/types/admin';

const CATEGORY_LABEL: Record<
  SensitiveWordCategory,
  { label: string; tone: 'destructive' | 'warning' | 'muted' }
> = {
  illegal: { label: '违法', tone: 'destructive' },
  porn: { label: '色情', tone: 'destructive' },
  ad: { label: '广告', tone: 'warning' },
  harassment: { label: '人身攻击', tone: 'warning' },
  other: { label: '其他', tone: 'muted' },
};

const ACTION_LABEL: Record<
  SensitiveWordAction,
  { label: string; desc: string; tone: 'destructive' | 'warning' | 'muted' }
> = {
  block: { label: '拒发', desc: '命中后直接拒绝发布', tone: 'destructive' },
  review: { label: '送审', desc: '命中后进入人工审核队列', tone: 'warning' },
  mask: { label: '打码', desc: '替换为 ** 后正常发布', tone: 'muted' },
};

type FilterCategory = SensitiveWordCategory | 'all';
type FilterAction = SensitiveWordAction | 'all';

export default function SensitiveWordsPage() {
  const [items, setItems] = React.useState<SensitiveWord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [reloading, setReloading] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [filterCat, setFilterCat] = React.useState<FilterCategory>('all');
  const [filterAct, setFilterAct] = React.useState<FilterAction>('all');
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SensitiveWord | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const reload = React.useCallback(() => {
    setLoading(true);
    listSensitiveWords({ pageSize: 200 })
      .then((res) => setItems(res.items))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const filtered = React.useMemo(() => {
    return items.filter((w) => {
      if (filterCat !== 'all' && w.category !== filterCat) return false;
      if (filterAct !== 'all' && w.action !== filterAct) return false;
      const q = search.trim().toLowerCase();
      if (q) {
        return w.word.toLowerCase().includes(q) || (w.note ?? '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [items, filterCat, filterAct, search]);

  const counts = React.useMemo(() => {
    const enabled = items.filter((w) => w.enabled).length;
    const totalHits = items.reduce((sum, w) => sum + w.hitCount, 0);
    return { total: items.length, enabled, totalHits };
  }, [items]);

  function openCreate() {
    setEditing(null);
    setEditorOpen(true);
  }

  function openEdit(w: SensitiveWord) {
    setEditing(w);
    setEditorOpen(true);
  }

  async function handleToggleEnabled(w: SensitiveWord) {
    try {
      await updateSensitiveWord(w.id, { enabled: !w.enabled });
      toast.success(`已${w.enabled ? '停用' : '启用'} "${w.word}"`);
      reload();
    } catch (err) {
      toast.error((err as Error).message || '操作失败');
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteSensitiveWord(deleteId);
      toast.success('已删除');
      setDeleteId(null);
      reload();
    } catch (err) {
      toast.error((err as Error).message || '删除失败');
    }
  }

  async function handleReload() {
    setReloading(true);
    try {
      const res = await reloadSensitiveWords();
      toast.success(`已热重载词库 · 生效 ${res.count} 条`);
    } catch (err) {
      toast.error((err as Error).message || '热重载失败');
    } finally {
      setReloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">敏感词管理</h1>
          <p className="text-sm text-muted-foreground">
            共 {counts.total} 条 · 启用 {counts.enabled} 条 · 累计命中{' '}
            {counts.totalHits.toLocaleString()} 次 · 修改后需热重载生效
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleReload} disabled={reloading}>
            <RefreshCw className={reloading ? 'animate-spin' : ''} />
            {reloading ? '重载中…' : '热重载词库'}
          </Button>
          <Button onClick={openCreate}>
            <Plus />
            添加敏感词
          </Button>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索敏感词或备注…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCat} onValueChange={(v) => setFilterCat(v as FilterCategory)}>
          <SelectTrigger className="w-36">
            <FilterIcon className="size-3.5 text-muted-foreground" />
            <SelectValue placeholder="分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            <SelectItem value="illegal">违法</SelectItem>
            <SelectItem value="porn">色情</SelectItem>
            <SelectItem value="ad">广告</SelectItem>
            <SelectItem value="harassment">人身攻击</SelectItem>
            <SelectItem value="other">其他</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterAct} onValueChange={(v) => setFilterAct(v as FilterAction)}>
          <SelectTrigger className="w-32">
            <Shield className="size-3.5 text-muted-foreground" />
            <SelectValue placeholder="动作" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部动作</SelectItem>
            <SelectItem value="block">拒发</SelectItem>
            <SelectItem value="review">送审</SelectItem>
            <SelectItem value="mask">打码</SelectItem>
          </SelectContent>
        </Select>
        {(search || filterCat !== 'all' || filterAct !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setFilterCat('all');
              setFilterAct('all');
            }}
          >
            清除筛选
          </Button>
        )}
        <div className="ml-auto text-xs text-muted-foreground">
          {filtered.length} / {items.length}
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[24%]">词</TableHead>
              <TableHead>分类</TableHead>
              <TableHead>动作</TableHead>
              <TableHead className="text-right">命中次数</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>添加人</TableHead>
              <TableHead>更新</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                  加载中…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                  没有匹配的敏感词
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((w) => {
                const cat = CATEGORY_LABEL[w.category];
                const act = ACTION_LABEL[w.action];
                return (
                  <TableRow key={w.id} className={!w.enabled ? 'opacity-50' : ''}>
                    <TableCell>
                      <div className="space-y-0.5">
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
                          {w.word}
                        </code>
                        {w.note && (
                          <p
                            className="line-clamp-1 max-w-[260px] text-xs text-muted-foreground"
                            title={w.note}
                          >
                            {w.note}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={cat.tone}>{cat.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={act.tone} title={act.desc}>
                        {act.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {w.hitCount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {w.enabled ? (
                        <span className="text-xs font-medium text-green-600 dark:text-green-400">
                          启用中
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">已停用</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{w.createdBy}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {relativeTime(w.updatedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => handleToggleEnabled(w)}
                          title={w.enabled ? '停用' : '启用'}
                        >
                          <Power className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => openEdit(w)}
                          title="编辑"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setDeleteId(w.id)}
                          title="删除"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <p className="text-xs text-muted-foreground">
        敏感词命中后采取 <strong>{ACTION_LABEL.block.label}</strong> /{' '}
        <strong>{ACTION_LABEL.review.label}</strong> / <strong>{ACTION_LABEL.mask.label}</strong>{' '}
        三种动作。修改后点击「热重载词库」推送到 Redis,所有 API 节点立即生效。
      </p>

      <SensitiveWordEditor
        key={editing?.id ?? 'new'}
        open={editorOpen}
        editing={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={() => {
          setEditorOpen(false);
          reload();
        }}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除该敏感词?</AlertDialogTitle>
            <AlertDialogDescription>
              删除后将不再拦截相关内容。建议先停用观察,确认无影响再删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SensitiveWordEditor({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: SensitiveWord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [word, setWord] = React.useState(editing?.word ?? '');
  const [category, setCategory] = React.useState<SensitiveWordCategory>(
    editing?.category ?? 'other',
  );
  const [actionVal, setActionVal] = React.useState<SensitiveWordAction>(editing?.action ?? 'block');
  const [note, setNote] = React.useState(editing?.note ?? '');
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setWord(editing?.word ?? '');
      setCategory(editing?.category ?? 'other');
      setActionVal(editing?.action ?? 'block');
      setNote(editing?.note ?? '');
    }
  }, [open, editing]);

  async function handleSubmit() {
    if (!word.trim()) {
      toast.error('请填写敏感词');
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await updateSensitiveWord(editing.id, {
          word: word.trim(),
          category,
          action: actionVal,
          note,
        });
        toast.success('已更新');
      } else {
        await createSensitiveWord({
          word: word.trim(),
          category,
          action: actionVal,
          note: note.trim() || undefined,
        });
        toast.success('已添加');
      }
      onSaved();
    } catch (err) {
      toast.error((err as Error).message || '保存失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? '编辑敏感词' : '添加敏感词'}</DialogTitle>
          <DialogDescription>
            敏感词大小写不敏感。改动会写入审计日志,需点击「热重载词库」推送到 Redis 后生效。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sw-word">敏感词</Label>
            <Input
              id="sw-word"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder="例如:扫码加好友"
              maxLength={50}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sw-cat">分类</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as SensitiveWordCategory)}
              >
                <SelectTrigger id="sw-cat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="illegal">违法</SelectItem>
                  <SelectItem value="porn">色情</SelectItem>
                  <SelectItem value="ad">广告</SelectItem>
                  <SelectItem value="harassment">人身攻击</SelectItem>
                  <SelectItem value="other">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sw-act">动作</Label>
              <Select
                value={actionVal}
                onValueChange={(v) => setActionVal(v as SensitiveWordAction)}
              >
                <SelectTrigger id="sw-act">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="block">拒发 — 直接拒绝</SelectItem>
                  <SelectItem value="review">送审 — 进人工审核</SelectItem>
                  <SelectItem value="mask">打码 — 替换为 **</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sw-note">备注（选填）</Label>
            <Textarea
              id="sw-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="为什么要拦截?上下文示例?误伤情况?"
              rows={3}
              maxLength={500}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? '保存中…' : editing ? '保存修改' : '添加'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
