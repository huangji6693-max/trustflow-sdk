import { AccountBalanceMonitor, LowBalanceAlert, BalanceUpdate } from '../src/stellar/monitor';
import type { AccountInfo } from '../src/stellar/account';

describe('AccountBalanceMonitor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('throws an error if no address is provided', () => {
    expect(() => new AccountBalanceMonitor({ address: '' })).toThrow(
      'Account address is required for monitoring',
    );
  });

  it('validates minBalanceXLM threshold and throws on invalid or non-finite values (#556)', () => {
    expect(() => new AccountBalanceMonitor({ address: 'GBM123', minBalanceXLM: 'not-a-number' })).toThrow(
      /Invalid minBalanceXLM threshold/i,
    );
    expect(() => new AccountBalanceMonitor({ address: 'GBM123', minBalanceXLM: NaN })).toThrow(
      /Invalid minBalanceXLM threshold/i,
    );
    expect(() => new AccountBalanceMonitor({ address: 'GBM123', minBalanceXLM: Infinity })).toThrow(
      /Invalid minBalanceXLM threshold/i,
    );
    expect(() => new AccountBalanceMonitor({ address: 'GBM123', minBalanceXLM: -Infinity })).toThrow(
      /Invalid minBalanceXLM threshold/i,
    );
  });

  it('accepts valid numeric and numeric-string minBalanceXLM thresholds (#556)', () => {
    expect(() => new AccountBalanceMonitor({ address: 'GBM123', minBalanceXLM: 10 })).not.toThrow();
    expect(() => new AccountBalanceMonitor({ address: 'GBM123', minBalanceXLM: '10' })).not.toThrow();
    expect(() => new AccountBalanceMonitor({ address: 'GBM123', minBalanceXLM: '0.5' })).not.toThrow();
    expect(() => new AccountBalanceMonitor({ address: 'GBM123', minBalanceXLM: 0 })).not.toThrow();
  });

  it('polls balance and triggers balance_update event', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      address: 'GBM123',
      balanceXLM: '100.5',
      sequenceNumber: '12345',
      isActive: true,
    } as AccountInfo);

    const monitor = new AccountBalanceMonitor({
      address: 'GBM123',
      minBalanceXLM: 20,
      fetchFn: mockFetch,
    });

    let update: BalanceUpdate | null = null;
    monitor.on('balance_update', (data) => {
      update = data;
    });

    await monitor.checkNow();

    expect(mockFetch).toHaveBeenCalledWith('GBM123', 'TESTNET');
    expect(update).not.toBeNull();
    expect(update?.balanceXLM).toBe('100.5');
    expect(update?.address).toBe('GBM123');
  });

  it('triggers low_balance event when balance falls below threshold', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      address: 'GBM123',
      balanceXLM: '5.0',
      sequenceNumber: '12345',
      isActive: true,
    } as AccountInfo);

    const monitor = new AccountBalanceMonitor({
      address: 'GBM123',
      minBalanceXLM: 10,
      fetchFn: mockFetch,
    });

    let alert: LowBalanceAlert | null = null;
    monitor.on('low_balance', (data) => {
      alert = data;
    });

    await monitor.checkNow();

    expect(alert).not.toBeNull();
    expect(alert?.currentBalanceXLM).toBe('5.0');
    expect(alert?.thresholdXLM).toBe('10');
  });

  it('sends webhook notification on low balance', async () => {
    const originalFetch = global.fetch;
    const mockGlobalFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockGlobalFetch as any;

    const mockFetch = jest.fn().mockResolvedValue({
      address: 'GBM123',
      balanceXLM: '2.5',
      sequenceNumber: '12345',
      isActive: true,
    } as AccountInfo);

    const monitor = new AccountBalanceMonitor({
      address: 'GBM123',
      minBalanceXLM: 10,
      webhookUrl: 'https://alerts.example.com/webhook',
      fetchFn: mockFetch,
    });

    await monitor.checkNow();

    expect(mockGlobalFetch).toHaveBeenCalledWith(
      'https://alerts.example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );

    global.fetch = originalFetch;
  });

  it('manages polling lifecycle with start and stop', () => {
    const mockFetch = jest.fn().mockResolvedValue({
      address: 'GBM123',
      balanceXLM: '50',
      sequenceNumber: '1',
      isActive: true,
    });

    const monitor = new AccountBalanceMonitor({
      address: 'GBM123',
      pollIntervalMs: 5000,
      fetchFn: mockFetch,
    });

    expect(monitor.isRunning()).toBe(false);
    monitor.start();
    expect(monitor.isRunning()).toBe(true);

    jest.advanceTimersByTime(5000);
    expect(mockFetch).toHaveBeenCalled();

    monitor.stop();
    expect(monitor.isRunning()).toBe(false);
  });

  it('never has two balance checks in flight when a poll tick fires before the last one resolves', async () => {
    const info = {
      address: 'GBM123',
      balanceXLM: '50',
      sequenceNumber: '1',
      isActive: true,
    } as AccountInfo;
    let resolveFirst!: (value: AccountInfo) => void;
    const mockFetch = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<AccountInfo>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue(info);

    const monitor = new AccountBalanceMonitor({
      address: 'GBM123',
      pollIntervalMs: 1000,
      fetchFn: mockFetch,
    });

    monitor.start();
    jest.advanceTimersByTime(2000);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    resolveFirst(info);
    await monitor.checkNow();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await monitor.checkNow();
    expect(mockFetch).toHaveBeenCalledTimes(2);

    monitor.stop();
  });

  it('aborts a hung webhook POST after webhookTimeoutMs without blocking the check', async () => {
    jest.useRealTimers();
    const originalFetch = global.fetch;
    const hangingFetch = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    global.fetch = hangingFetch as any;

    const monitor = new AccountBalanceMonitor({
      address: 'GBM123',
      minBalanceXLM: 10,
      webhookUrl: 'https://alerts.example.com/webhook',
      webhookTimeoutMs: 20,
      fetchFn: jest.fn().mockResolvedValue({
        address: 'GBM123',
        balanceXLM: '2.5',
        sequenceNumber: '1',
        isActive: true,
      } as AccountInfo),
    });

    try {
      await expect(monitor.checkNow()).resolves.toMatchObject({ balanceXLM: '2.5' });
      expect(hangingFetch).toHaveBeenCalledWith(
        'https://alerts.example.com/webhook',
        expect.objectContaining({ method: 'POST', signal: expect.anything() }),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});
