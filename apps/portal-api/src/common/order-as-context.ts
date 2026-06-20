import { AsyncLocalStorage } from 'async_hooks';

export const orderAsStorage = new AsyncLocalStorage<string | null>();
