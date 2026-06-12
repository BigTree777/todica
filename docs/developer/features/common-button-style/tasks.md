# タスク: 共通ボタンスタイル (common-button-style)

> [`plan.md`](plan.md) を実行可能な単位に分解する. 完了したらチェックを入れる.

## テスト設計 (test-designer)

- [ ] T-01: 新規 `web/__tests__/common-button-style.test.tsx` を起こす. AC-1 〜 AC-13 (= spec シナリオ全件) を失敗するテストとして書く.
  - [ ] T-01a: `button.css` 文字列存在チェック (`.button` / `.button--primary` / `.button--danger` / `.button--ghost` / `:focus-visible` / `:disabled` セレクタ + cursor / appearance / border / border-radius / padding / background / color 宣言が含まれる + transition / animation / box-shadow が含まれない).
  - [ ] T-01b: `main.tsx` 内に `import "./styles/button.css"` が存在.
  - [ ] T-01c: 影響範囲表「対象」13 ファイル × 24 button 全てが `className.includes("button")` を満たす render テスト.
  - [ ] T-01d: variant 配分 (D-008) 通りに `--primary` / `--danger` / `--ghost` が付与されているかの render テスト.
  - [ ] T-01e: 既存配置制御 className (`task-card__actions__delete` / `task-card__actions__complete` / `project-card__actions__delete` / `project-card__submit` / `routine-card__actions__delete` / `routine-card__submit`) が `.button` と併記される render テスト.
  - [ ] T-01f: 対象外 button (`priority-stars__star` / `app-shell__hamburger` / `app-shell__menu-close`) に `"button"` が含まれない render テスト.
  - [ ] T-01g: 既存 onClick / onSubmit / disabled が回帰しない最小テスト (click 1 件 / disabled 視覚 1 件).
  - [ ] T-01h: `project-create-dialog.css` に `.project-create-dialog button { padding: ... }` 宣言が存在しないことを文字列 assert.
- [ ] T-02: 既存テスト (`task-card-component.test.tsx` / `project-card-component.test.tsx` / `routine-card-component.test.tsx` / `inline-edit-all-cards.test.tsx` 等) で className 完全一致 assert が存在するかを grep で洗い出し, 必要があれば追従候補を tasks に追加する.

## 実装 (implementer)

- [ ] I-01: `web/src/styles/button.css` を新設する (plan §「button.css の構造 (確定値)」をそのまま反映).
- [ ] I-02: `web/src/main.tsx` の line 23 直後に `import "./styles/button.css";` を追加.
- [ ] I-03: task-card.tsx の 4 button に className を当てる (D-008).
- [ ] I-04: task-form-card.tsx の「追加」button に `className="button button--primary"` を当てる.
- [ ] I-05: project-card.tsx の「削除」button に `className="button button--danger project-card__actions__delete"` を当てる.
- [ ] I-06: project-form-card.tsx の「追加」button に `className="button button--primary project-card__submit"` を当てる.
- [ ] I-07: routine-card.tsx の「削除」button に `className="button button--danger routine-card__actions__delete"` を当てる.
- [ ] I-08: routine-form-card.tsx の「追加」button に `className="button button--primary routine-card__submit"` を当てる.
- [ ] I-09: trash-view.tsx の 2 button (「ゴミ箱を空にする」`--danger` / 「復元」`--ghost`) に className を当てる.
- [ ] I-10: settings-view.tsx の 3 button (「保存」「変更を保存」`--primary` / mode 切替 `--ghost`) に className を当てる.
- [ ] I-11: setup-view.tsx の 2 button (「接続する」`--primary` / 「ローカルモードで使う」`--ghost`) に className を当てる.
- [ ] I-12: project-create-dialog.tsx の 2 button (「追加」`--primary` / 「キャンセル」`--ghost`) に className を当てる.
- [ ] I-13: pwa-update-banner.tsx の 2 button (「再読み込み」`--primary` / 「閉じる」`--ghost`) に className を当てる.
- [ ] I-14: error-notification.tsx の `×` button に `className="button button--ghost"` を当てる (D-001).
- [ ] I-15: conflict-dialog.tsx の 2 button (「サーバの値を採用」`--primary` / 「クライアントの値で再送」`--ghost`) に className を当てる.
- [ ] I-16: `web/src/ui/project-create-dialog/project-create-dialog.css` の `.project-create-dialog button { padding: ... }` を撤去 (= `.button` 基底に統合). `min-height: 44px` は維持 (D-005). `:focus-visible` 宣言を撤去 (D-002).

## テスト (implementer / test-designer)

- [ ] V-01: 新規 `common-button-style.test.tsx` (T-01) を全 green にする.
- [ ] V-02: 既存単体テスト (vitest) を全 green に保つ. 失敗があれば test-designer に差し戻して追従.
- [ ] V-03: 既存 E2E ツールテスト (playwright) を全 green に保つ.
- [ ] V-04: a11y violations 0 件を維持 (jest-axe).

## ドキュメント

- [ ] D-01: BL-067 の status を Todo → Doing → Done の遷移は管理者の責務 (= 本仕様内では更新しない).
- [ ] D-02: 本機能で `tokens.css` 改修が必要になった場合 (= 別 BL 起票相当) は `docs/developer/planning/backlog.md` に追加. 本 BL では追加なし (D-003 / R-2 参照).

## 監査 (auditor)

- [ ] A-01: spec.md AC-1 〜 AC-13 が全て満たされていること.
- [ ] A-02: shadow / hover background / transition / animation が `.button` 系に**含まれていない**こと (NFR-NO-SHADOW / NFR-NO-HOVER-TRANSITION).
- [ ] A-03: 対象外 button (`priority-stars__star` / `app-shell__hamburger` / `app-shell__menu-close`) に `.button` が**付与されていない**こと.
- [ ] A-04: 既存配置制御 className が**維持されている**こと (= 撤去されていない).
- [ ] A-05: 既存 onClick / aria-label / type / disabled が**変更されていない**こと.
- [ ] A-06: `tokens.css` 改修が**含まれていない**こと.

## 仕上げ

- [ ] F-01: 受け入れ基準 (spec.md AC-1 〜 AC-13) を全て満たすことを確認.
- [ ] F-02: backlog.md BL-067 を Doing → Done に更新 (管理者).
- [ ] F-03: PR 作成 + auditor 承認 + merge (GitHub Flow).
