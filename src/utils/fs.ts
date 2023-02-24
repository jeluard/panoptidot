import * as fs from 'fs/promises';
import { constants } from 'fs';

export async function listDirectories(source: string) {
  return (await fs.readdir(source, { withFileTypes: true }))
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => `${source}/${dirent.name}`);
}

export async function listFiles(source: string) {
  return (await fs.readdir(source, { withFileTypes: true }))
    .filter((dirent) => dirent.isFile())
    .map((dirent) => `${source}/${dirent.name}`);
}

export async function checkFileExists(file: string): Promise<boolean> {
  return fs
    .access(file, constants.F_OK)
    .then(() => true)
    .catch(() => false);
}
