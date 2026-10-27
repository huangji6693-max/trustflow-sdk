import { MockWalletAdapter, createPlaywrightWalletScript } from '../src/testing';

describe('MockWalletAdapter rejection and browser injection (Issue #478 & #660)', () => {
  it('simulates user rejection via rejectNext()', async () => {
    const wallet = new MockWalletAdapter();
    expect(await wallet.signTransaction('AAAA')).toBe('AAAA');

    wallet.rejectNext('User declined transaction');
    await expect(wallet.signTransaction('AAAA')).rejects.toThrow('User declined transaction');

    // Subsequent calls succeed
    expect(await wallet.signTransaction('AAAA')).toBe('AAAA');
  });

  it('simulates rejection on connect', async () => {
    const wallet = new MockWalletAdapter({ shouldReject: true });
    await expect(wallet.connect()).rejects.toThrow('User rejected request');
  });

  it('provides a window.freighter-shaped object via toFreighterGlobal() including signMessage', async () => {
    const wallet = new MockWalletAdapter();
    const globalObj = wallet.toFreighterGlobal();

    expect(await globalObj.isConnected()).toBe(true);
    expect(await globalObj.getPublicKey()).toBe(wallet.publicKey);
    const res = await globalObj.signTransaction('AAAA');
    expect(res.signedXDR).toBe('AAAA');
    expect(await globalObj.signMessage('hello_trustflow')).toBe('mock_sig_hello_trustflow');
  });

  it('generates a Playwright init script whose signMessage matches toFreighterGlobal()', async () => {
    const wallet = new MockWalletAdapter({ publicKey: 'G123' });
    const script = createPlaywrightWalletScript({ publicKey: 'G123' });
    expect(script).toContain('window.freighter');
    expect(script).toContain('G123');
    expect(script).toContain('mock_sig_${msg}');

    const fakeWindow: Record<string, unknown> = {};
    const runInitScript = new Function('window', script);
    runInitScript(fakeWindow);

    const injectedFreighter = fakeWindow.freighter as ReturnType<MockWalletAdapter['toFreighterGlobal']>;
    const globalObj = wallet.toFreighterGlobal();

    expect(await injectedFreighter.getPublicKey()).toBe(await globalObj.getPublicKey());
    expect(await injectedFreighter.signMessage('challenge_nonce_42')).toBe(
      await globalObj.signMessage('challenge_nonce_42'),
    );
    expect(await injectedFreighter.signMessage('challenge_nonce_42')).toBe(
      'mock_sig_challenge_nonce_42',
    );
  });
});
