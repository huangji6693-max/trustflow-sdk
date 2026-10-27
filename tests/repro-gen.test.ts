import { xdr } from '@stellar/stellar-sdk';
import { generateTypeScriptBindings } from '../src/contract/bindings';

const t = {
  u32: () => xdr.ScSpecTypeDef.scSpecTypeU32(),
  string: () => xdr.ScSpecTypeDef.scSpecTypeString(),
  i128: () => xdr.ScSpecTypeDef.scSpecTypeI128(),
  bool: () => xdr.ScSpecTypeDef.scSpecTypeBool(),
  map: (keyType: xdr.ScSpecTypeDef, valueType: xdr.ScSpecTypeDef) =>
    xdr.ScSpecTypeDef.scSpecTypeMap(new xdr.ScSpecTypeMap({ keyType, valueType })),
  vec: (elementType: xdr.ScSpecTypeDef) =>
    xdr.ScSpecTypeDef.scSpecTypeVec(new xdr.ScSpecTypeVec({ elementType })),
  tuple: (valueTypes: xdr.ScSpecTypeDef[]) =>
    xdr.ScSpecTypeDef.scSpecTypeTuple(new xdr.ScSpecTypeTuple({ valueTypes })),
  udt: (name: string) => xdr.ScSpecTypeDef.scSpecTypeUdt(new xdr.ScSpecTypeUdt({ name })),
};

function structEntry(
  name: string,
  fields: { name: string; type: xdr.ScSpecTypeDef }[],
): xdr.ScSpecEntry {
  return xdr.ScSpecEntry.scSpecEntryUdtStructV0(
    new xdr.ScSpecUdtStructV0({
      doc: '',
      lib: '',
      name,
      fields: fields.map(
        (f) => new xdr.ScSpecUdtStructFieldV0({ doc: '', name: f.name, type: f.type }),
      ),
    }),
  );
}

function fnEntry(
  name: string,
  inputs: { name: string; type: xdr.ScSpecTypeDef }[],
  outputs: xdr.ScSpecTypeDef[] = [],
): xdr.ScSpecEntry {
  return xdr.ScSpecEntry.scSpecEntryFunctionV0(
    new xdr.ScSpecFunctionV0({
      doc: '',
      name,
      inputs: inputs.map(
        (i) => new xdr.ScSpecFunctionInputV0({ doc: '', name: i.name, type: i.type }),
      ),
      outputs,
    }),
  );
}

describe('generateTypeScriptBindings - struct and function codegen', () => {
  it('generates interface and client methods for a struct and two functions', () => {
    const specEntries = [
      structEntry('Config', [
        { name: 'base_fee', type: t.i128() },
        { name: 'weights', type: t.map(t.string(), t.u32()) },
        { name: 'stages', type: t.vec(t.u32()) },
      ]),
      fnEntry('configure', [{ name: 'config', type: t.udt('Config') }], [t.bool()]),
      fnEntry('batch', [{ name: 'pair', type: t.tuple([t.u32(), t.string()]) }], [t.u32()]),
    ];

    const code = generateTypeScriptBindings(specEntries, { className: 'Gen' });

    expect(code).toContain('export interface Config {');
    expect(code).toContain('base_fee: bigint;');
    expect(code).toContain('weights: Record<string, number>;');
    expect(code).toContain('stages: number[];');
    expect(code).toContain('export class Gen extends AbstractContractClient {');
    expect(code).toContain('async configure(');
    expect(code).toContain('args: { config: Config },');
    expect(code).toContain('Promise<ContractCallResult & { result?: boolean }>');
    expect(code).toContain('async readConfigure(args: { config: Config }): Promise<boolean>');
    expect(code).toContain('async simulateConfigure(args: { config: Config }): Promise<SimulationResult>');
    expect(code).toContain('async batch(');
    expect(code).toContain('Promise<ContractCallResult & { result?: number }>');
    expect(code).toContain('async readBatch(');
    expect(code).toContain('async simulateBatch(');
  });
});
