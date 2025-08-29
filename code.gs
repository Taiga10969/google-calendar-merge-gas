/**
 * Google カレンダー統合スクリプト（Google Apps Script / Code.gs）
 *
 * 概要:
 * - 複数の「ソース」カレンダーから予定を集約し、1つの「統合先（ターゲット）」カレンダーに片方向ミラーします。
 * - カレンダーごとにコピー方法（モード）・色の扱い・BUSY_SECRETのprefix を指定できます。
 * - ゲストはコピーしません（通知メールも送られません）。保険として作成後にゲストがいれば削除します。
 * - 統合先の削除戦略を選べます（専用=期間内を全削除 / 混在=タグ付きのみ削除）。
 * - ソース予定側で特定タグ（例: MIRROR_TAG）を含むイベントを「コピー対象から除外」できます。
 * - 参加ステータス（INVITED/NO/MAYBE）ごとに、コピーする/しないを設定できます（EXCLUDE_STATUS）。
 *
 * 使い方（超概要）:
 * 1) 統合先カレンダーの ID（例: xxxxx@group.calendar.google.com）を TARGET_CAL_ID に設定
 * 2) SOURCES に統合したいカレンダー ID とモード（ALL/TITLE_ONLY/BUSY_SECRET）、必要なら prefix や color を設定
 * 3) 必要に応じて色ポリシー・削除戦略・除外設定を調整
 * 4) syncOnce() を実行（初回は認可ダイアログに従って許可）
 * 5) トリガーで定期実行を設定
 */

// === 必須: 統合先（ターゲット）カレンダーID ===
const TARGET_CAL_ID = 'your-merged-calendar-id@group.calendar.google.com';

// === 実行の同時競合を避けるためのロック（true 推奨） ===
const ENABLE_SCRIPT_LOCK = true; // トリガーが重なった際の事故防止

// === 削除と説明欄に関する設定 ===
// DEDICATED_TARGET=true  : 統合先はこのスクリプト専用 → 期間内の予定を「すべて削除」してから再作成（説明欄にタグ不要）
// DEDICATED_TARGET=false : 統合先は手動予定等と混在    → 「このスクリプトが作成した予定（タグ付き）だけ」削除して再作成
const DEDICATED_TARGET = true;

// 説明欄に入れる付加情報（専用運用なら通常すべて false 推奨）
const ADD_MIRROR_TAG   = !DEDICATED_TARGET; // true なら説明欄に MIRROR_TAG を入れます（混在運用の識別用）
const ADD_SOURCE_LINE  = false;             // true で "Source: <name> (<id>)" を説明欄に付加
const ADD_ORIGINAL_URL = false;             // true で "Original: <URL>" を説明欄に付加

// このスクリプトが作成した予定の識別用タグ文字列（混在運用時の削除対象を絞るため）
// ※ DEDICATED_TARGET=false のときだけ実際に説明欄に付与されます
const MIRROR_TAG = '[MIRRORED_BY_GAS]';

// === ソース予定の「タグによる除外」設定 ===
// true なら、SOURCE_EXCLUDE_TAGS に含まれる任意のタグ文字列が指定フィールドに含まれているイベントを“コピーしない”
const SOURCE_EXCLUDE_BY_TAGS = true;
// 除外に使うタグ（デフォルトで MIRROR_TAG を設定。必要に応じて追加可）
const SOURCE_EXCLUDE_TAGS = [MIRROR_TAG];
// チェック対象フィールドを選択（'description' / 'title' / 'location'）
const SOURCE_EXCLUDE_FIELDS = ['description']; // 例: ['description', 'title']

// === 自分の参加ステータスによる除外設定（EXCLUDE_STATUSに完全移行） ===
// CalendarApp.GuestStatus: YES（参加）/ NO（不参加）/ MAYBE（未定）/ INVITED（招待のみ・未承認）
const EXCLUDE_STATUS = {
  INVITED: true,  // 招待のみ（未承認）はコピーしない
  NO:      false, // 不参加も除外したい場合は true に
  MAYBE:   false, // 未定も除外したい場合は true に
  // YES は常にコピー対象（設定不要）
};

// === 色の扱いに関する設定 ===
// 'COPY'     : ソース予定の色をコピー
// 'NONE'     : 色は一切設定しない（統合先のデフォルト色）
// 'OVERRIDE' : 固定色で上書き（ソースごとの color 指定があればそれを優先、なければ DEFAULT_OVERRIDE_COLOR）
const COLOR_MODE = 'OVERRIDE';

// OVERRIDEモード時、ソースに color 未指定の場合のデフォルト色
const DEFAULT_OVERRIDE_COLOR = CalendarApp.EventColor.PALE_BLUE;

// BUSY_SECRET モードのイベントを常に特定色にしたい場合に指定（null なら無効）
const BUSY_SECRET_COLOR = CalendarApp.EventColor.GRAY;

// === ソースカレンダー一覧 ===
// - id:     カレンダーID（プライマリはメールアドレス、サブは ...@group.calendar.google.com）
// - mode:   "ALL" | "TITLE_ONLY" | "BUSY_SECRET"
// - prefix: BUSY_SECRET のときのタイトル接頭辞（省略時はカレンダー名）
// - color:  COLOR_MODE='OVERRIDE' のときに使う色（CalendarApp.EventColor.*）
const SOURCES = [
  { id: 'source1@gmail.com',                         mode: 'ALL' },
  { id: 'team-project@group.calendar.google.com',    mode: 'TITLE_ONLY', color: CalendarApp.EventColor.PALE_RED },
  { id: 'private-tasks@group.calendar.google.com',   mode: 'BUSY_SECRET', prefix: 'Private', color: CalendarApp.EventColor.GRAY },
];

// === 同期対象期間（必要に応じて調整） ===
const WINDOW_PAST_DAYS   = 30;  // 過去 n 日分
const WINDOW_FUTURE_DAYS = 180; // 未来 n 日分

// タイトル先頭に [カレンダー名] を付ける（ALL / TITLE_ONLY のときのみ適用）
const TITLE_PREFIX_WITH_SOURCE = true;

/**
 * メイン処理：指定期間の統合先をクリア → ソースからコピー
 */
function syncOnce() {
  // （任意）同時実行を回避：トリガーが重なった場合の保護
  let lock = null;
  if (ENABLE_SCRIPT_LOCK) {
    lock = LockService.getScriptLock();
    try {
      lock.waitLock(30 * 1000); // 最大 30 秒待機
    } catch (e) {
      console.warn('別の syncOnce が実行中のため今回の実行はスキップしました');
      return;
    }
  }

  try {
    const targetCal = CalendarApp.getCalendarById(TARGET_CAL_ID);
    if (!targetCal) throw new Error('統合先カレンダーIDが不正です: ' + TARGET_CAL_ID);

    const now   = new Date();
    const start = shiftDays(now, -WINDOW_PAST_DAYS);
    const end   = shiftDays(now,  WINDOW_FUTURE_DAYS);

    // 1) 統合先のクリア
    if (DEDICATED_TARGET) {
      // 専用運用：期間内のすべての予定を削除（説明欄にタグ等は不要）
      deleteAllInWindow_(targetCal, start, end);
    } else {
      // 混在運用：このスクリプトが作成した予定（説明欄に MIRROR_TAG を含む）だけ削除
      deleteMirroredOnly_(targetCal, start, end, MIRROR_TAG);
    }

    // 2) ソースごとのコピー処理
    for (const { id: calId, mode, prefix, color } of SOURCES) {
      const srcCal = CalendarApp.getCalendarById(calId);
      if (!srcCal) {
        console.warn('スキップ: カレンダーが見つかりません → ' + calId);
        continue;
      }

      const srcName = srcCal.getName() || calId;
      const events  = srcCal.getEvents(start, end);

      events.forEach((ev) => {
        // --- まず除外条件をチェック ---
        // 1) ソース側のタグ（説明/タイトル/場所）に基づく除外
        if (SOURCE_EXCLUDE_BY_TAGS && shouldSkipSourceEventByTags_(ev)) return;
        // 2) 自分の参加ステータス（INVITED/NO/MAYBE）に基づく除外
        if (shouldSkipByStatus_(ev)) return;

        // --- タイトル・本文・場所をモードに応じて組み立て ---
        let title = ev.getTitle() || '';
        let description = '';
        let location = '';

        // 説明欄に付けるメタ情報（専用運用では通常すべて無し）
        const headerParts = [];
        if (ADD_MIRROR_TAG) headerParts.push(MIRROR_TAG);
        if (ADD_SOURCE_LINE) headerParts.push(`Source: ${srcName} (${calId})`);
        if (ADD_ORIGINAL_URL && typeof ev.getHtmlLink === 'function') {
          const u = ev.getHtmlLink();
          if (u) headerParts.push(`Original: ${u}`);
        }
        const header = headerParts.join('\n');

        // ソース側の本文/場所
        const srcDesc = (typeof ev.getDescription === 'function') ? (ev.getDescription() || '') : '';
        const srcLoc  = (typeof ev.getLocation === 'function') ? (ev.getLocation() || '') : '';

        switch (mode) {
          case 'ALL': // タイトル・本文・場所をそのままコピー
            if (TITLE_PREFIX_WITH_SOURCE) title = `[${srcName}] ${title}`;
            description = [header, srcDesc].filter(Boolean).join('\n\n');
            location    = srcLoc;
            break;

          case 'TITLE_ONLY': // タイトルと時間だけコピー（本文/場所は落とす）
            if (TITLE_PREFIX_WITH_SOURCE) title = `[${srcName}] ${title}`;
            description = header;
            location    = '';
            break;

          case 'BUSY_SECRET': // タイトルを [prefix] 予定あり に置換し、非公開にする
            const label = prefix || srcName;
            title       = `[${label}] 予定あり`;
            description = header;
            location    = '';
            break;

          default: // 想定外のモードは安全側で header のみ
            description = header;
        }

        // --- 統合先に予定を作成（ゲストは一切指定しない＝招待メールは飛ばない） ---
        const options = {
          description,
          location,
          sendInvites: false, // 保険（指定してもゲスト未指定なのでメールは送られない）
        };

        let created;
        if (isAllDay_(ev)) {
          // 終日イベントは createAllDayEvent を使用（endTime は「最終日の翌日」を渡す仕様）
          created = targetCal.createAllDayEvent(title, ev.getAllDayStartDate(), {
            ...options,
            endTime: ev.getAllDayEndDate(),
          });
        } else {
          created = targetCal.createEvent(title, ev.getStartTime(), ev.getEndTime(), options);
        }

        // BUSY_SECRET は非公開に
        if (mode === 'BUSY_SECRET') {
          try { created.setVisibility(CalendarApp.Visibility.PRIVATE); } catch (e) {}
        }

        // --- 色の適用（ポリシーに従う） ---
        applyColorPolicy_(created, ev, { mode, perSourceColor: color });

        // --- 念のためゲストが付いていたら削除（将来仕様変更への保険） ---
        try {
          const guests = created.getGuestList();
          if (guests && guests.length > 0) {
            guests.forEach(g => created.removeGuest(g.getEmail()));
          }
        } catch (e) { /* ignore */ }
      });
    }
  } finally {
    if (ENABLE_SCRIPT_LOCK && lock) lock.releaseLock();
  }
}

/* =========================
 *  補助ロジック（色/除外/削除/ユーティリティ）
 * ========================= */

/**
 * 色の適用ロジック
 * - COLOR_MODE に応じて createdEvent に色を設定します。
 * - BUSY_SECRET モードでは BUSY_SECRET_COLOR が指定されていればそれを優先します。
 */
function applyColorPolicy_(createdEvent, sourceEvent, ctx) {
  if (COLOR_MODE === 'NONE') return; // 色を付けない

  // BUSY_SECRET専用色が指定されている場合は最優先
  if (ctx.mode === 'BUSY_SECRET' && BUSY_SECRET_COLOR) {
    try { createdEvent.setColor(BUSY_SECRET_COLOR); } catch (e) {}
    return;
  }

  if (COLOR_MODE === 'OVERRIDE') {
    // ソースに color 指定があればそれを、なければデフォルトを適用
    const colorToUse = ctx.perSourceColor || DEFAULT_OVERRIDE_COLOR;
    try { createdEvent.setColor(colorToUse); } catch (e) {}
    return;
  }

  if (COLOR_MODE === 'COPY') {
    // 可能ならソースの色をコピー
    try {
      if (typeof sourceEvent.getColor === 'function') {
        const srcColor = sourceEvent.getColor();
        if (srcColor) createdEvent.setColor(srcColor);
      }
    } catch (e) { /* ignore */ }
  }
}

/**
 * コピー元イベントのタグ除外フィルタ
 * - SOURCE_EXCLUDE_TAGS のいずれかを、SOURCE_EXCLUDE_FIELDS に含まれるフィールドで検出したら除外。
 */
function shouldSkipSourceEventByTags_(ev) {
  try {
    const fields = new Set(SOURCE_EXCLUDE_FIELDS.map(s => String(s).toLowerCase()));
    const values = [];

    if (fields.has('description') && typeof ev.getDescription === 'function') {
      values.push(ev.getDescription() || '');
    }
    if (fields.has('title') && typeof ev.getTitle === 'function') {
      values.push(ev.getTitle() || '');
    }
    if (fields.has('location') && typeof ev.getLocation === 'function') {
      values.push(ev.getLocation() || '');
    }
    if (values.length === 0) return false; // フィールド未指定なら何もしない

    // いずれかのフィールドに、いずれかのタグが含まれていれば除外
    return SOURCE_EXCLUDE_TAGS.some(tag =>
      !!tag && values.some(v => String(v).includes(tag))
    );
  } catch (e) {
    return false; // エラー時は安全側で「除外しない」
  }
}

/**
 * 自分の参加ステータスの除外フィルタ
 * - EXCLUDE_STATUS の設定に従って INVITED / NO / MAYBE を除外。
 */
function shouldSkipByStatus_(ev) {
  try {
    const s = ev.getMyStatus(); // CalendarApp.GuestStatus
    if (s === CalendarApp.GuestStatus.INVITED && EXCLUDE_STATUS.INVITED) return true;
    if (s === CalendarApp.GuestStatus.NO       && EXCLUDE_STATUS.NO)      return true;
    if (s === CalendarApp.GuestStatus.MAYBE    && EXCLUDE_STATUS.MAYBE)   return true;
    return false;
  } catch (e) {
    return false; // 取得できない環境では除外しない
  }
}

/**
 * （専用運用向け）期間内の予定を全削除
 * - DEDICATED_TARGET=true のときに使用。説明欄にタグが無くても全て削除します。
 */
function deleteAllInWindow_(cal, start, end) {
  const events = cal.getEvents(start, end);
  events.forEach((e) => e.deleteEvent());
}

/**
 * （混在運用向け）タグ付き予定だけ削除
 * - 説明欄に MIRROR_TAG を含むイベントのみ削除するため、手動で入れた予定は保持されます。
 */
function deleteMirroredOnly_(cal, start, end, tag) {
  const events = cal.getEvents(start, end);
  events.forEach((e) => {
    const desc = (typeof e.getDescription === 'function') ? (e.getDescription() || '') : '';
    if (desc.includes(tag)) e.deleteEvent();
  });
}

/**
 * 終日イベント判定
 * - getAllDayStartDate()/getAllDayEndDate() が取得できれば終日とみなす（例外時は false）
 */
function isAllDay_(ev) {
  try {
    const s = ev.getAllDayStartDate();
    const e = ev.getAllDayEndDate();
    return s instanceof Date && e instanceof Date;
  } catch (_) {
    return false;
  }
}

/**
 * 日付を指定日数ずらす（時刻は 00:00 に正規化）
 */
function shiftDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * （任意）毎時トリガーを作成
 * - 実運用では 15〜60 分間隔での時間主導トリガーが現実的です。
 */
function createTriggerEveryHour() {
  ScriptApp.newTrigger('syncOnce')
    .timeBased()
    .everyHours(1)
    .create();
}
