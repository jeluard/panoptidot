import * as fs from 'fs/promises';
import { constants } from 'fs';
import { DispatchInfo } from '@polkadot/types/interfaces/types.js';
import {
  Conviction,
  Delegatees,
  Delegates,
  Delegation,
  Event,
  Extrinsic,
} from './types.js';

await extractIndexes('data');

async function listDirectories(source: string) {
  return (await fs.readdir(source, { withFileTypes: true }))
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => `${source}/${dirent.name}`);
}

async function listFiles(source: string) {
  return (await fs.readdir(source, { withFileTypes: true }))
    .filter((dirent) => dirent.isFile())
    .map((dirent) => `${source}/${dirent.name}`);
}

async function checkFileExists(file: string): Promise<boolean> {
  return fs
    .access(file, constants.F_OK)
    .then(() => true)
    .catch(() => false);
}

function extractEvent(
  events: Array<Event>,
  section: string,
  method: string
): Event | undefined {
  return events.find(
    (event) => event.section == section && event.method == method
  );
}

function extractExtrinsicSuccessEvent(
  events: Array<Event>
): DispatchInfo | undefined {
  return extractEvent(events, 'system', 'ExtrinsicSuccess')
    ?.data[0] as DispatchInfo;
}

function createIndexes(
  allData: Record<string, Record<string, Record<string, Extrinsic>>>
): Record<string, object> {
  const entries = Array.from(Object.entries(allData));
  entries.sort(([block1], [block2]) => parseInt(block1) - parseInt(block2));
  const delegates = entries.reduce((index, [, extrinsics]) => {
    Object.entries(extrinsics).forEach(([section, methods]) => {
      if (section == 'convictionVoting') {
        Object.entries(methods).forEach(
          ([method, { signer, args, events }]) => {
            if (extractExtrinsicSuccessEvent(events)) {
              // Ignore failed extrinsics
              if (method == 'delegate') {
                /* delegate(class: u16, to: MultiAddress, conviction: PalletConvictionVotingConviction, balance: u128) */
                const [track, to, conviction, balance] = args;
                const id = to.id as string;
                const existingDelegators = index[id]?.delegators || {};
                const existingDelegatee: Record<number, Delegation> =
                  existingDelegators[signer] || {};
                existingDelegatee[track] = { conviction, balance };
                existingDelegators[signer] = existingDelegatee;

                index[id] = {
                  totalDelegation: totalDelegation(existingDelegators),
                  delegators: existingDelegators,
                };
              } else if (method == 'undelegate') {
                /* undelegate(class: u16) */
                const [track] = args;
                top: for (const [delegate, delegatees] of Object.entries(
                  index
                )) {
                  for (const [delegatee, delegations] of Object.entries(
                    delegatees.delegators
                  )) {
                    if (delegatee == signer) {
                      delete delegations[track];
                      if (Object.entries(delegations).length > 0) {
                        index[delegate].delegators[delegatee] = delegations;
                      } else {
                        delete index[delegate].delegators[delegatee];
                      }
                      index[delegate].totalDelegation = totalDelegation(
                        index[delegate].delegators
                      );
                      break top;
                    }
                  }
                }
              }
            }
          }
        );
      }
    });
    return index;
  }, {} as Delegates);

  return { delegates };
}

async function readContentFile(fileName: string): Promise<{ data: any }> {
  if (await checkFileExists(fileName)) {
    return JSON.parse(await fs.readFile(fileName, 'utf8'));
  } else {
    return { data: {} };
  }
}

function convictionMultiplier(conviction: Conviction): number {
  switch (conviction) {
    case 'None':
      return 1 / 10;
    case 'Locked1x':
      return 1;
    case 'Locked2x':
      return 2;
    case 'Locked3x':
      return 3;
    case 'Locked4x':
      return 4;
    case 'Locked5x':
      return 5;
  }
}

function delegationFor(delegations: Record<number, Delegation>): number {
  return Object.values(delegations).reduce(
    (acc, delegation) =>
      acc + delegation.balance * convictionMultiplier(delegation.conviction),
    0
  );
}

function totalDelegation(delegatees: Delegatees): number {
  return Object.values(delegatees).reduce(
    (acc, delegations) => acc + delegationFor(delegations),
    0
  );
}

function mergeBlocks<T>(
  allBlocks: Array<{ data: Record<string, T> }>
): Record<string, T> {
  return allBlocks.reduce((acc, { data }) => {
    return { ...data, ...acc };
  }, {} as Record<string, T>);
}

async function extractIndexes(folder: string) {
  // load blocks from local filesystem
  // check no gaps exists
  // If an existing index exist, use as base and aggregate on top

  const folders = await listDirectories(`${folder}/blocks`);
  const files = (
    await Promise.all(folders.map((file) => listFiles(`${file}`)))
  ).flat();
  const content = await Promise.all(files.map(readContentFile));
  const allBlocks = mergeBlocks<any>(content);
  const indexesFolder = `${folder}/indexes`;
  await fs.mkdir(indexesFolder, { recursive: true });
  const indexFileName = `${indexesFolder}/index.json`;

  const indexes = createIndexes(allBlocks);
  Object.entries(indexes).forEach(async ([index, data]) => {
    const delegatesFileName = `${indexesFolder}/${index}.json`;
    await fs.writeFile(
      delegatesFileName,
      JSON.stringify({ /*meta: { span: { from, to } },*/ data })
    );
  });

  await fs.writeFile(
    indexFileName,
    JSON.stringify({ data: Object.keys(indexes) })
  );
}
