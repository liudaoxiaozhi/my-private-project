'use client';
// app/media/MediaDialog.tsx —— 书影音页和想看清单共用的弹窗：只读详情，或添加 / 编辑（AnimeEditor）
import AnimeDetail from './AnimeDetail';
import AnimeEditor from './AnimeEditor';
import type { MediaLibrary } from './useMediaLibrary';
import type { AnimeEntry, AnimeKind } from '../../lib/anime';

export type Dialog = { type: 'create' } | { type: 'edit'; entry: AnimeEntry } | { type: 'view'; entry: AnimeEntry } | null;

interface MediaDialogProps {
  library: MediaLibrary;
  dialog: Dialog;
  setDialog: (dialog: Dialog) => void;
  /** 新建时的默认类型 */
  defaultKind?: AnimeKind;
  /** 保存成功后（弹窗已关闭）；新建的条目可以借此切到它所在的分栏 */
  onSaved?: (entry: AnimeEntry, isEdit: boolean) => void;
}

export default function MediaDialog({ library, dialog, setDialog, defaultKind, onSaved }: MediaDialogProps) {
  if (!dialog) return null;
  const close = () => setDialog(null);
  if (dialog.type === 'view') return <AnimeDetail entry={dialog.entry} onClose={close} />;

  const editing = dialog.type === 'edit' ? dialog.entry : null;
  return (
    <AnimeEditor
      // 换条目时重新挂载，表单状态不串
      key={editing ? editing.id : 'create'}
      entry={editing}
      defaultKind={defaultKind}
      findExisting={library.findExisting}
      credentials={library.credentials}
      onCredentialSaved={library.credentialSaved}
      onOpenExisting={(entry) => {
        library.showToast('这部已经添加过了，直接打开编辑', 'info');
        setDialog({ type: 'edit', entry });
      }}
      onSave={async (input) => {
        const saved = await library.saveEntry(editing ? editing.id : null, input);
        close();
        library.showToast(editing ? '已保存' : `已添加《${saved.title}》`, 'success');
        onSaved?.(saved, !!editing);
      }}
      onDelete={
        editing
          ? async () => {
              await library.removeEntry(editing);
              close();
            }
          : undefined
      }
      onClose={close}
    />
  );
}
