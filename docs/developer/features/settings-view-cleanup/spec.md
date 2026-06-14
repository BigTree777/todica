# 仕様: SettingsView の構造・文言整理 (4 件まとめ)

- 状態: ドラフト
- 関連: [`../../planning/backlog.md`](../../planning/backlog.md) BL-094

## 背景 / 課題

SettingsView 全体として:

1. ログアウト section が外箱 `<section>` + 内 `button--ghost` で **二重の枠** に見える.
2. パスワード変更フォームの label と input が横並びで **改行が無くて視認性が低い**.
3. submit button の文言が「保存」/「更新」/「変更する」と **3 通りに揺れている**.
4. リセット時刻のラベルが平文 + 入力欄と submit button が縦並びで, ラベル強調が弱く操作場所もまばら.

## ゴール

- 上記 4 件を一括で整理する.

## 非ゴール

- server API / repository / OpenAPI / DB schema の改修.
- SettingsView 内の他 section (モード切替 / カウンタ表示) の構造変更.
- 文言以外の挙動変更.

## 要件

- **FR-1 (ログアウト二重箱解消)**: `<section aria-label="ログアウト">` を `.settings-view__logout` クラスに切替, `.settings-view__section` の border / padding を外す.
- **FR-2 (パスワード変更フォーム縦並び)**: 「現在のパスワード」「新しいパスワード」「新しいパスワード (確認)」の 3 ブロックで label を `display: block` 化し input が下に来る縦並びにする.
- **FR-3 (ボタン文言「変更」統一)**: リセット時刻 submit button の `保存`/`更新` 三項とパスワード変更 submit の `変更する` を **すべて「変更」** に統一.
- **FR-4 (リセット時刻ラベル太字 + 横変更ボタン)**: リセット時刻 form を 2 段構成にする. 1 段目: 太字ラベル `リセット時刻`. 2 段目: input と「変更」ボタンが横並び.

## 受け入れ基準

```
シナリオ: ログアウト section が外枠を持たない
  Given SettingsView (onLogout 渡し)
  When  ログアウト button をレンダする
  Then  外側 section に .settings-view__section クラスが無く .settings-view__logout が付く
```

```
シナリオ: パスワード変更フォームが縦並び
  Given パスワード変更フォーム
  When  label の CSS を確認する
  Then  label が display: block を持ち input が次行に来る
```

```
シナリオ: submit button 文言が「変更」に統一
  Given SettingsView
  When  リセット時刻 form / パスワード変更 form の submit button を確認する
  Then  両 button の textContent が「変更」のみ
```

```
シナリオ: リセット時刻ラベルが太字
  Given リセット時刻 form
  When  ラベル要素の CSS を確認する
  Then  .settings-view__label が font-weight: bold を持つ
```

```
シナリオ: リセット時刻 input と変更ボタンが横並び
  Given リセット時刻 form の 2 段目
  When  DOM 構造を確認する
  Then  input と submit button が .settings-view__field-row 内に並ぶ
```
