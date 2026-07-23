export interface TabSaveState {
  label: string;
  onSave: () => void;
  saving: boolean;
  disabled?: boolean;
  error?: string | null;
  success?: string | null;
}

export type OnTabSaveStateChange = (state: TabSaveState | null) => void;
