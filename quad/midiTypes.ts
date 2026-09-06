export interface MIDIOutputBasic {
  id: string;
  name?: string;
  manufacturer?: string;
  type: 'output';
  send: (data: number[] | Uint8Array, timestamp?: number) => void;
}
