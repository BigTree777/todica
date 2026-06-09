/**
 * tomorrow-view placeholder (BL-036 / ui-sidebar-nav).
 *
 * 「明日のタスク」一覧 + 起票ビュー. BL-036 の時点では placeholder.
 * 実装本体は BL-038 で行う.
 *
 * spec.md REQ-5 / plan.md D-004:
 *   - 見出し + 「準備中 (BL-038)」テキストのみ.
 *   - データ取得 / 起票 / mutation を持たない.
 */
export function TomorrowViewPlaceholder(): JSX.Element {
  return (
    <section aria-label="明日のタスク">
      <h1>明日のタスク</h1>
      <p>準備中 (BL-038)</p>
    </section>
  );
}
