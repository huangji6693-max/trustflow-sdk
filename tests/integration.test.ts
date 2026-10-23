import * as SDK from '../src/index';
import * as EscrowBarrel from '../src/escrow/index';
import * as WalletBarrel from '../src/wallet/index';

describe('SDK Barrel Public Export Surface Integration Tests', () => {
    // Maintained allowlist tracking expected exported public modules to catch accidental drop drift
    const expectedExports = [
        'MultiSigEscrowClient',
        'TrustFlowClient',
        'TrustFlowError'
    ];

    it('should assert all core modules and clients are correctly exported from the public entry point', () => {
        const actualExports = Object.keys(SDK);
        
        for (const exportName of expectedExports) {
            expect(actualExports).toContain(exportName);
        }
    });

    it('should explicitly guarantee TrustFlowError is exported from the entry barrel surface', () => {
        expect(SDK).toHaveProperty('TrustFlowError');
    });

    it('exports disputeEscrow from both the package root and the escrow barrel', () => {
        expect(typeof SDK.disputeEscrow).toBe('function');
        expect(typeof EscrowBarrel.disputeEscrow).toBe('function');
        expect(SDK.disputeEscrow).toBe(EscrowBarrel.disputeEscrow);
    });

    it('keeps wallet helpers on the /wallet subpath, matching the documented import (#439)', () => {
        expect(typeof WalletBarrel.connectWallet).toBe('function');
        expect(typeof WalletBarrel.isFreighterInstalled).toBe('function');
        expect(WalletBarrel.TrustFlowError).toBe(SDK.TrustFlowError);
        expect(SDK).not.toHaveProperty('connectWallet');
        expect(SDK).not.toHaveProperty('isFreighterInstalled');
    });

    it('exports DisputeClient from both the package root and the escrow barrel', () => {
        expect(SDK.DisputeClient).toBe(EscrowBarrel.DisputeClient);
    });

    it('makes the dispute and monitor option types nameable from the package root', () => {
        const options: SDK.DisputeClientOptions = {};
        const phase: SDK.EscrowMonitorErrorPhase = 'fetch';
        const onError: SDK.EscrowMonitorOnError = (_error: unknown, _context: SDK.EscrowMonitorErrorContext) => {};
        expect(options).toEqual({});
        expect(phase).toBe('fetch');
        expect(typeof onError).toBe('function');
    });

    it('makes the resilient-polling and dispute types nameable from the package root and escrow barrel (#468, #471)', () => {
        const onReconnect: SDK.EscrowMonitorOnReconnect = (_info: SDK.MonitorReconnectInfo) => {};
        const onGap: SDK.EscrowMonitorOnGap = (_info: SDK.MonitorGapInfo) => {};
        const resilientOpts: SDK.ResilientPollingOptions = {};
        const fetchFn: SDK.CursorAwareFetchFn = async (_cursor?: string) => ({
            events: [],
            cursor: null,
            hasMore: false,
        });

        const onReconnectBarrel: EscrowBarrel.EscrowMonitorOnReconnect = (_info: EscrowBarrel.MonitorReconnectInfo) => {};
        const onGapBarrel: EscrowBarrel.EscrowMonitorOnGap = (_info: EscrowBarrel.MonitorGapInfo) => {};
        const resilientOptsBarrel: EscrowBarrel.ResilientPollingOptions = {};
        const fetchFnBarrel: EscrowBarrel.CursorAwareFetchFn = async (_cursor?: string) => ({
            events: [],
            cursor: null,
            hasMore: false,
        });

        const disputeRoot: SDK.Dispute = {
            id: 'dsp-1',
            status: 'open',
        };
        const disputeBarrel: EscrowBarrel.Dispute = {
            id: 'dsp-2',
            status: 'resolved',
        };

        expect(typeof onReconnect).toBe('function');
        expect(typeof onGap).toBe('function');
        expect(resilientOpts).toEqual({});
        expect(typeof fetchFn).toBe('function');
        expect(typeof onReconnectBarrel).toBe('function');
        expect(typeof onGapBarrel).toBe('function');
        expect(resilientOptsBarrel).toEqual({});
        expect(typeof fetchFnBarrel).toBe('function');
        expect(disputeRoot.id).toBe('dsp-1');
        expect(disputeBarrel.id).toBe('dsp-2');
    });
});
