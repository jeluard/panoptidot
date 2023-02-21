export type Extrinsic = {
  index: number;
  signer: string;
  args: any[];
  events: Array<{ data: any; section: string; method: string }>;
};

export type Event = {
  section: string;
  method: string;
  data: any;
};

export type Address = string;

export type TrackId = number;

export type BlockNumber = number;

export type Delegatees = Record<Address, Record<TrackId, Delegation>>;

export type Delegates = Record<Address, Delegatees>;

export type Conviction =
  | 'None'
  | 'Locked1x'
  | 'Locked2x'
  | 'Locked3x'
  | 'Locked4x'
  | 'Locked5x';

export type Delegation = {
  conviction: Conviction;
  balance: number;
};
