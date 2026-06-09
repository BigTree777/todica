/**
 * focus-view placeholder (BL-036 / ui-sidebar-nav).
 *
 * 「現在のタスク」を単独大表示するビュー. BL-036 の時点では placeholder.
 * 実装本体は BL-037 で行う.
 *
 * spec.md REQ-5 / plan.md D-004:
 *   - 見出し + 「準備中 (BL-037)」テキストのみ.
 *   - データ取得 / 起票 / mutation を持たない.
 */
export function FocusViewPlaceholder(): JSX.Element {
  return (
    <section aria-label="現在のタスク">
      <h1>現在のタスク</h1>
      <p>準備中 (BL-037)</p>
    </section>
  );
}
