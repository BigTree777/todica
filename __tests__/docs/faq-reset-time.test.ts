/**
 * ドキュメント文言テスト: docs/user/faq.md の「リセット時刻」表記.
 *
 * 受け入れ基準の出典:
 *   - docs/developer/features/reset-time-rework/spec.md §「(G-3) UI ラベル変更」
 *     シナリオ「docs/user/faq.md の「日次リセットの時刻は変えられますか?」回答が
 *     「リセット時刻」表記になっている」
 *
 * 検証ポイント:
 *   - docs/user/faq.md に「リセット時刻」という表記が存在する.
 *   - docs/user/faq.md に「境界時刻」という表記が存在しない (ユーザー向け文言は新文言のみ).
 *
 * 現状ファイル:
 *   docs/user/faq.md の Q「日次リセットの時刻は変えられますか?」回答に
 *     「設定画面の「境界時刻」から変更できます。境界時刻を跨ぐと…」
 *   と記載があり, 本テストは失敗する (= 旧文言「境界時刻」が残っている).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
// __tests__/docs/ から見たリポジトリルートは ../../
const FAQ_PATH = resolve(here, "../../docs/user/faq.md");

describe("docs/user/faq.md: 「リセット時刻」表記への統一 (spec.md G-3)", () => {
  it("「リセット時刻」という表記が含まれる", () => {
    const content = readFileSync(FAQ_PATH, "utf-8");
    expect(content).toMatch(/リセット時刻/);
  });

  it("「境界時刻」という表記は含まれない (ユーザー向け文言は新文言のみ)", () => {
    const content = readFileSync(FAQ_PATH, "utf-8");
    expect(content).not.toMatch(/境界時刻/);
  });
});
