export type AppDialogRequest =
  | {
      kind: 'confirm';
      title: string;
      message: string;
      confirmLabel?: string;
      cancelLabel?: string;
      danger?: boolean;
      resolve: (value: boolean) => void;
    }
  | {
      kind: 'prompt';
      title: string;
      message?: string;
      defaultValue?: string;
      placeholder?: string;
      confirmLabel?: string;
      cancelLabel?: string;
      resolve: (value: string | null) => void;
    };

type Listener = (req: AppDialogRequest | null) => void;

let currentRequest: AppDialogRequest | null = null;
const listeners = new Set<Listener>();

function emit(req: AppDialogRequest | null) {
  currentRequest = req;
  for (const listener of listeners) {
    listener(req);
  }
}

export function subscribeAppDialog(listener: Listener): () => void {
  listeners.add(listener);
  listener(currentRequest);
  return () => {
    listeners.delete(listener);
  };
}

export function appConfirm(options: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    emit({
      kind: 'confirm',
      ...options,
      resolve: (val) => {
        emit(null);
        resolve(val);
      },
    });
  });
}

export function appPrompt(options: {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    emit({
      kind: 'prompt',
      ...options,
      resolve: (val) => {
        emit(null);
        resolve(val);
      },
    });
  });
}
