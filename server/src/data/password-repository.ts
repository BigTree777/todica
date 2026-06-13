export interface PasswordRepository {
  getHash(): Promise<string | null>;
  setHash(hash: string, now: number): Promise<void>;
}
