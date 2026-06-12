/**
 * `<RoutineCard>` (BL-061 / routine-card-component / BL-070 で編集モード概念撤去).
 *
 * 仕様参照:
 *   docs/developer/features/routine-card-component/spec.md REQ-1.
 *   docs/developer/features/routine-card-edit-fields/spec.md REQ-2.
 *   docs/developer/features/inline-edit-all-cards/spec.md REQ-3 / G-3.
 *
 * 役割:
 *   - routines-view の各ルーティン行を描画する単一の presentational コンポーネント.
 *   - 表示モードのみ. 編集モード概念 (旧 `is`+`Editing` prop / 旧 `editing`+`Name` 系 prop /
 *     旧 `editing`+`DaysOfWeek` / 旧 `editing`+`DefaultPriority`) は BL-070 で撤去
 *     (=「変更」「保存」「キャンセル」 button をすべて廃止).
 *   - 名前は常時 input で編集可能, blur で `onNameBlur(next)` を親に通知.
 *   - 曜日 (7 checkbox) / 優先度 (PriorityStars) は click 即時に親 handler を呼ぶ (REQ-4 / D-012 案 e).
 *
 * 重要な決定:
 *   - D-002 (BL-061): `as` prop で root tag を `<li>` / `<div>` から選択.
 *   - BL-070 D-001: 同値 blur の抑制は親 view に置く.
 *   - BL-070 D-002 / P-001 (iii): 空文字 blur の元値復元は blur ハンドラ内で
 *     `e.currentTarget.value = routine.name` を同期的に書き戻して実現 (uncontrolled input).
 *     key (entity.id + entity.name) はサーバ正本値変化時の再マウント同期用.
 *   - BL-070 D-009: input id は `routine-name-{routine.id}` で起票側 `routine-name` と衝突回避.
 *   - BL-070 P-003: PriorityStars idPrefix は `routine-{routine.id}` で起票側 `routine-create` と衝突回避.
 */
import type { Priority } from "@todica/domain/task";
import type { WebRoutine } from "../../repositories/routine-repository.js";
import { PriorityStars } from "../priority-stars/priority-stars.js";
import "./routine-card.css";

/** 曜日 0 (日) 〜 6 (土) の表示ラベル. */
const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export interface RoutineCardProps {
  /** 表示対象ルーティン. */
  routine: WebRoutine;
  /** name input の blur ハンドラ. BL-070 REQ-3 で追加 (必須). */
  onNameBlur: (next: string) => void;
  /** 曜日 checkbox の変更ハンドラ (即時 PATCH 経路 / REQ-4). */
  onDaysOfWeekChange: (next: number[]) => void;
  /** 優先度変更ハンドラ (即時 PATCH 経路 / REQ-4). */
  onDefaultPriorityChange: (next: Priority) => void;
  /** 「削除」 button のクリックハンドラ. */
  onDelete: () => void;
  /** ラッパ要素のタグ (D-002). default: "li". */
  as?: "li" | "div";
}

export function RoutineCard(props: RoutineCardProps): JSX.Element {
  const {
    routine,
    onNameBlur,
    onDaysOfWeekChange,
    onDefaultPriorityChange,
    onDelete,
    as = "li",
  } = props;

  // D-012 (BL-061): as prop に応じて root tag を切替.
  const Tag = as as "li";
  const inputId = `routine-name-${routine.id}`;

  return (
    <Tag className="routine-card">
      {/* BL-073 REQ-1 / REQ-2 / D-001 / D-002: 4 段ゾーン構造 (起票カードと同イディオム).
          header 段は PriorityStars 単独で右端固定 (左空 / D-002).
          right alignment は基底 `.routine-card__header { justify-content: flex-end }` で実現. */}
      <div className="routine-card__header">
        <PriorityStars
          value={routine.defaultPriority}
          onChange={onDefaultPriorityChange}
          groupLabel={`${routine.name} の優先度`}
          idPrefix={`routine-${routine.id}`}
        />
      </div>
      {/* BL-073 REQ-1 / REQ-3 / D-003: title 段に visually-hidden label + name input.
          `.routine-card__title` セレクタは BL-072 で起票カードに新設したものを表示カードでも共用. */}
      <div className="routine-card__title">
        <label htmlFor={inputId} className="visually-hidden">
          ルーティン名
        </label>
        {/* BL-070 REQ-3: 表示時に常時 input を描画. P-001 (iii): uncontrolled + key で再マウントを制御.
            空文字 blur (D-002) は親が PATCH を短絡し state も key も変わらないため,
            カード側で DOM 値を正本値 (routine.name) に書き戻して表示を復元する. */}
        <input
          key={`routine-name-${routine.id}-${routine.name}`}
          id={inputId}
          type="text"
          className="routine-card__input"
          defaultValue={routine.name}
          placeholder="ルーティン名"
          onBlur={(e) => {
            const next = e.currentTarget.value;
            if (next === "") {
              e.currentTarget.value = routine.name;
            }
            onNameBlur(next); // D-001: カードは常に blur 値を流す (空文字も含む)
          }}
        />
      </div>
      <div className="routine-card__day-checkboxes" role="group" aria-label="曜日">
        {DAY_LABELS.map((label, day) => (
          <label key={day}>
            <input
              type="checkbox"
              checked={routine.daysOfWeek.includes(day)}
              onChange={() => {
                const next = routine.daysOfWeek.includes(day)
                  ? routine.daysOfWeek.filter((d) => d !== day)
                  : [...routine.daysOfWeek, day].sort((a, b) => a - b);
                onDaysOfWeekChange(next);
              }}
            />
            {label}
          </label>
        ))}
      </div>
      <div className="routine-card__actions">
        <button type="button" className="routine-card__actions__delete" onClick={onDelete}>
          削除
        </button>
      </div>
    </Tag>
  );
}
