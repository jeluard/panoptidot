import '@polkadot/api-augment/kusama';
import '@polkadot/rpc-augment';
import '@polkadot/types-augment';

import * as fs from 'fs/promises';
import { constants } from 'fs';
import { ApiPromise, WsProvider } from '@polkadot/api';
import type { FrameSystemEventRecord } from '@polkadot/types/lookup';
import { BlockHash } from '@polkadot/types/interfaces/types.js';
import { newApi } from './utils/polkadot-api.js';
import { Event, Extrinsic } from './types.js';

const api = await newApi({
  provider: new WsProvider(['wss://kusama-rpc.polkadot.io']),
});

type BlockNumber = number;

// First block with OpenGov on kusama: 0x925eea1b3a1944fb592aa26b4e41c0926921d2e289a932942d6267a038cbcbce ; 15426014

//console.log(api.registry.lookup.types.map(o => o.type.path.toString()))
//console.log(        api.registry.getDefinition('PalletConvictionVotingVoteAccountVote'))

const folder = 'data';
const fromHash = await api.rpc.chain.getFinalizedHead();
const from = await api.rpc.chain.getBlock(
  '0x925eea1b3a1944fb592aa26b4e41c0926921d2e289a932942d6267a038cbcbce'
);
const to = await api.rpc.chain.getBlock(fromHash);
await extractAll(
  api,
  from.block.header.number.toNumber(),
  to.block.header.number.toNumber(),
  folder
);

function extractAssociatedEvents(
  index: number,
  allEvents: Array<FrameSystemEventRecord>
): Array<Event> {
  return allEvents
    .filter(
      ({ phase, event }) =>
        phase.isApplyExtrinsic &&
        phase.asApplyExtrinsic.eq(index) &&
        event.section != 'paraInclusion'
    ) // Somehow 'paraInclusion' pass former condition
    .map(({ event }) => event)
    .map(({ data, section, method }) => {
      return { section, method, data: data.map((o) => o.toHuman()) };
    });
}

function augmentExtrinsic(
  { index, signer, args }: Omit<Extrinsic, 'success' | 'events'>,
  allEvents: Array<FrameSystemEventRecord>
): Extrinsic {
  const events = extractAssociatedEvents(index, allEvents);
  return {
    index,
    signer,
    args,
    events,
  };
}

async function extractExtrinsics(
  api: ApiPromise,
  block: number,
  extrinsicsOfInterest: Record<string /*section*/, Array<string> /*methods*/>
) {
  const hash = await api.rpc.chain.getBlockHash(block);
  const {
    block: { extrinsics },
  } = await api.rpc.chain.getBlock(hash);
  const filteredExtrinsics = extrinsics
    .filter(({ method: { section, method } }) =>
      extrinsicsOfInterest[section]?.includes(method)
    )
    .map(({ signer, method: { section, method }, args }, index) => {
      return {
        index,
        section,
        method,
        signer: signer.toString(),
        args: args.map((arg) => arg.toString()),
      };
    });
  if (filteredExtrinsics.length > 0) {
    // There are some matching extrinsics in this block
    const apiAt = await api.at(hash);
    const allEvents = await apiAt.query.system.events();
    return filteredExtrinsics.reduce(
      (previous, { section, method, ...rest }) => {
        previous[section] = {};
        previous[section][method] = augmentExtrinsic(rest, allEvents);
        return previous;
      },
      {} as Record<string, Record<string, Extrinsic>>
    );
  }
}

async function extractAllExtrinsics(
  api: ApiPromise,
  from: number,
  to: number,
  extrinsicsOfInterest: Record<string /*section*/, Array<string> /*methods*/>
) {
  const data: Record<
    BlockNumber,
    Record<string, Record<string, Extrinsic>>
  > = {};
  for (const i of Array(to - from).keys()) {
    const block = from + i;
    const extrinsics = await extractExtrinsics(
      api,
      block,
      extrinsicsOfInterest
    );
    if (extrinsics) {
      data[block] = extrinsics;
    }

    // And scheduler (for referenda)
  }
  return data;
}

function* ranges(
  from: number,
  to: number,
  increment: number
): Generator<[number, number]> {
  let round = 0;
  const roundCount = Math.ceil((to - from) / increment);
  while (true) {
    const firstRound = round == 0;
    const lastRound = round == roundCount - 1;
    const roundFrom = firstRound
      ? from
      : from - (from % increment) + round * increment;
    const roundTo = lastRound
      ? to
      : from - (from % increment) + (round + 1) * increment;
    if (round >= roundCount) {
      break;
    }
    yield [roundFrom, roundTo];
    round++;
  }
}

async function checkFileExists(file: string): Promise<boolean> {
  return fs
    .access(file, constants.F_OK)
    .then(() => true)
    .catch(() => false);
}

async function extractAll(
  api: ApiPromise,
  from: number,
  to: number,
  folder: string
) {
  const structure = {
    convictionVoting: [
      'delegate',
      'undelegate',
      'vote',
      'removeVote',
      'removeOtherVote',
    ],
    referenda: ['submit'],
  };

  const chunkSize = 10_000;
  const chunksPerFolder = 10;

  const blocksFolder = `${folder}/blocks`;
  await fs.mkdir(blocksFolder, { recursive: true });

  for (const [rangeFrom, rangeTo] of ranges(from, to, chunkSize)) {
    console.log(`Retrieving data for range [${rangeFrom}, ${rangeTo}]`);

    const blocksFolderIndex =
      rangeFrom - (rangeFrom % (chunkSize * chunksPerFolder));
    const chunkFolder = `${blocksFolder}/${blocksFolderIndex}`;
    await fs.mkdir(chunkFolder, { recursive: true });

    const fileName = `${chunkFolder}/${rangeFrom}-${rangeTo}.json`;
    if (!(await checkFileExists(fileName))) {
      const before = Date.now();
      const data = await extractAllExtrinsics(
        api,
        rangeFrom,
        rangeTo,
        structure
      );
      await fs.writeFile(
        fileName,
        JSON.stringify({
          meta: { span: { rangeFrom, rangeTo }, structure },
          data,
        })
      );

      // Update index of all blocks
      const blocksIndexFileName = `${blocksFolder}/index.json`;
      await fs.writeFile(
        blocksIndexFileName,
        JSON.stringify({ data: [from, rangeTo] })
      );

      const after = Date.now();
      console.log(`Took ${(after - before) / 1000}s`);
    }
  }
}

async function extractFirstReferendaBlock(
  api: ApiPromise,
  from: number
): Promise<BlockHash> {
  let hash = await api.rpc.chain.getBlockHash(from);
  let modules = await api.registry.getModuleInstances('', 'referenda');
  let time = Date.now();
  let count = 0;
  while (modules) {
    ++count;
    const apiAt = await api.at(hash);
    modules = await apiAt.registry.getModuleInstances('', 'referenda');
    const {
      block: { header },
    } = await api.rpc.chain.getBlock(hash);
    hash = header.parentHash;
    if (count % 1000 == 0) {
      const now = Date.now();
      console.log(`Blocks: ${count}; hash: ${hash} in ${now - time} ms`);
      time = now;
    }
  }
  console.log(`Last hash: ${hash}`);
  return hash;
}

api.disconnect();
