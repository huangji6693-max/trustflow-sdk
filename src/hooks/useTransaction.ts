import { useState, useCallback, useRef } from 'react';

type TxStatus = 'idle' | 'pending' | 'success' | 'error';

export function useTransaction() {
  const [status, setStatus] = useState<TxStatus>('idle');
  const [hash, setHash] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const execute = useCallback(async (fn: () => Promise<string>) => {
    const requestId = ++requestIdRef.current;
    const isLatest = () => requestId === requestIdRef.current;

    setStatus('pending');
    setHash(undefined);
    setError(null);
    try {
      const h = await fn();
      if (isLatest()) {
        setHash(h);
        setStatus('success');
      }
      return h;
    } catch (e: unknown) {
      if (isLatest()) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
      throw e;
    }
  }, []);

  const reset = useCallback(() => {
    requestIdRef.current++;
    setStatus('idle');
    setHash(undefined);
    setError(null);
  }, []);

  return { status, hash, error, execute, reset, isPending: status === 'pending' };
}
