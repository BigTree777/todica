/**
 * 境界時刻の設定ビュー (BL-009 / FR-041 / FR-042).
 *
 * 仕様参照:
 *   - docs/developer/features/settings-day-boundary/spec.md §「Web クライアント SettingsView」
 *   - docs/developer/features/settings-day-boundary/plan.md §「UI 設計」
 *
 * 機能:
 *   - 初期表示: repository.getSettings() で dayBoundaryTime を取得して表示.
 *   - 保存: repository.patchSettings() でサーバに送信し、表示を更新.
 *   - クライアントバリデーション: HH:MM 形式 (00:00 - 23:59) のみ送信する.
 *   - 412 (楽観ロック): エラーメッセージを表示してユーザーに再試行を促す.
 */
import { useCallback, useEffect, useState } from "react";
import { PatchConflictError } from "../../repositories/settings-repository.js";
import type { PatchSettingsCommand, Settings, SettingsRepository } from "../../repositories/settings-repository.js";

/** dayBoundaryTime の形式バリデーション: HH:MM (00:00 - 23:59). */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface SettingsViewProps {
  repository: SettingsRepository;
}

export function SettingsView(props: SettingsViewProps): JSX.Element {
  const { repository } = props;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  // 初回マウント時に現在の設定を取得する.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await repository.getSettings();
      if (!cancelled) {
        setSettings(s);
        setInputValue(s.dayBoundaryTime);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      // クライアントバリデーション.
      if (!TIME_PATTERN.test(inputValue)) {
        setError("HH:MM 形式 (00:00 - 23:59) で入力してください。");
        return;
      }

      if (!settings) return;

      const cmd: PatchSettingsCommand = {
        dayBoundaryTime: inputValue,
        ifMatch: settings.version,
      };

      try {
        await repository.patchSettings(cmd);
        // PATCH 成功後に再フェッチしてサーバ正本値を反映する.
        const updated = await repository.getSettings();
        setSettings(updated);
        setInputValue(updated.dayBoundaryTime);
        setError(null);
      } catch (err) {
        if (err instanceof PatchConflictError) {
          // 412: PatchConflictError.settings（412 ボディから取得した最新値）を直接 state に反映する.
          // 追加の GET リクエストはしない（D-004）.
          setSettings(err.settings);
          setInputValue(err.settings.dayBoundaryTime);
          setError("設定の更新中に競合が発生しました。最新の値を表示しています。再度お試しください。");
        } else {
          setError("保存に失敗しました。");
        }
      }
    },
    [inputValue, settings, repository],
  );

  return (
    <main>
      <h1>設定</h1>

      {settings && (
        <div aria-label="設定値">
          <span>{settings.dayBoundaryTime}</span>
        </div>
      )}

      {error && (
        <div role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      <form onSubmit={handleSave} aria-label="設定フォーム">
        <div>
          <label htmlFor="day-boundary-time">境界時刻</label>
          <input
            id="day-boundary-time"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
        </div>
        <button type="submit">保存</button>
      </form>
    </main>
  );
}
