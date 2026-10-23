import { invoke } from '@tauri-apps/api/core';

export interface Note { id: string; title: string; body: string; branch_id: string; revision_id: string }
export interface Branch { id: string; note_id: string; name: string; head_revision_id: string; archived: boolean }
export interface Revision { id: string; note_id: string; branch_id: string; title: string; body: string; parents: string[]; kind: string; created_at: number | null }
export interface Settings { server_url: string; library_id: string | null; has_token: boolean; dark: boolean; database_path: string; selected_note: string | null; selected_branches: Record<string, string> }
export interface SyncStatus { configured: boolean; pending: number; last_sync: number | null; error: string | null }
export interface SyncResult { status: SyncStatus; conflicts: Branch[]; pushed: number }

export const bridge = {
  listNotes: () => invoke<Note[]>('list_notes', { branchId: null }),
  createNote: () => invoke<Note>('create_note', { title: '', body: '' }),
  getNote: (noteId: string, branchId: string) => invoke<Note>('get_note', { noteId, branchId }),
  saveNote: (note: Note) => invoke<Note>('save_note', { noteId: note.id, branchId: note.branch_id, title: note.title, body: note.body, expectedRevision: note.revision_id }),
  branches: (noteId: string) => invoke<Branch[]>('list_branches', { noteId }),
  history: (noteId: string, branchId: string) => invoke<Revision[]>('history', { noteId, branchId }),
  createBranch: (noteId: string, fromRevision: string, name: string) => invoke<Branch>('create_branch', { noteId, fromRevision, name }),
  renameBranch: (branchId: string, name: string) => invoke<Branch>('rename_branch', { branchId, name }),
  archiveBranch: (branchId: string, archived: boolean, activeBranchId: string) => invoke<Branch>('archive_branch', { branchId, archived, activeBranchId }),
  deleteBranch: (branchId: string, activeBranchId: string) => invoke<void>('delete_branch', { branchId, activeBranchId }),
  settings: () => invoke<Settings>('get_settings'),
  setSelection: (noteId: string, branchId: string) => invoke<void>('set_selection', { noteId, branchId }),
  saveSettings: (settings: Settings, token: string | null) => invoke<Settings>('save_settings', { serverUrl: settings.server_url, libraryId: settings.library_id || null, token, dark: settings.dark }),
  syncStatus: () => invoke<SyncStatus>('sync_status'),
  sync: () => invoke<SyncResult>('sync_now'),
  finishExit: () => invoke<void>('finish_exit'),
};
