import type { PasswordRepository } from "./data/password-repository.js";

export async function seedPasswordIfEmpty(
  repository: PasswordRepository,
  envHash: string,
  now: number,
): Promise<void> {
  if ((await repository.getHash()) !== null || envHash.length === 0) {
    return;
  }
  await repository.setHash(envHash, now);
}
