# Google Calendar Merger (Apps Script)

このプロジェクトは、複数の Google カレンダーを 1 つの統合カレンダーに自動的にコピー・統合する Google Apps Script です。

## ✨ 主な特徴

- 複数のカレンダーを 1 つの「共有用カレンダー」に集約
- カレンダーごとにコピー方法（ALL / TITLE_ONLY / BUSY_SECRET）を指定可能
- BUSY_SECRET モードではタイトルを「[prefix] 予定あり」に変換し、非公開予定に設定
- ゲスト情報はコピーせず、安全のため作成後に削除
- 色ポリシーを選択可能（COPY / NONE / OVERRIDE）
- 専用カレンダー運用（DEDICATED_TARGET=true）ならタグ不要でクリーンに同期
- ソース予定に特定タグ（例: [MIRRORED_BY_GAS]）を含む場合、コピー除外可能
- 自分の参加ステータス（INVITED / NO / MAYBE）ごとにコピー対象から除外可能

## 📂 ファイル構成

- `Code.gs` : メインの Google Apps Script。設定値を変更して利用します。

## ⚙️ セットアップ手順

1. Google ドライブで新しい **Apps Script プロジェクト**を作成します。
2. `Code.gs` の内容をコピーして貼り付けます。
3. スクリプト上部の **設定値** を自分の環境に合わせて変更します。

### 必須設定

```javascript
const TARGET_CAL_ID = 'your-merged-calendar-id@group.calendar.google.com';
```

統合先となるカレンダーの ID を指定してください。  
カレンダー ID は、Google カレンダーの「設定 > カレンダーの統合 > カレンダー ID」から取得できます。

### ソースカレンダーの指定

```javascript
const SOURCES = [
  { id: 'source1@gmail.com', mode: 'ALL' },
  { id: 'team-project@group.calendar.google.com', mode: 'TITLE_ONLY', color: CalendarApp.EventColor.PALE_RED },
  { id: 'private-tasks@group.calendar.google.com', mode: 'BUSY_SECRET', prefix: 'Private', color: CalendarApp.EventColor.GRAY },
];
```

- `id`: ソースカレンダーの ID（プライマリは Gmail アドレス、サブは `...@group.calendar.google.com`）
- `mode`:
  - `ALL`: タイトル・本文・場所をすべてコピー
  - `TITLE_ONLY`: タイトルと時間のみコピー
  - `BUSY_SECRET`: タイトルを「[prefix] 予定あり」にし、非公開予定に設定
- `prefix`: BUSY_SECRET のときの接頭辞（例: "Private"）
- `color`: COLOR_MODE=OVERRIDE のときに強制適用する色

### 色ポリシー

```javascript
const COLOR_MODE = 'OVERRIDE'; // 'COPY' | 'NONE' | 'OVERRIDE'
```

- `COPY`: ソースの色をコピー
- `NONE`: 色を付与しない
- `OVERRIDE`: 強制的に指定色を適用

BUSY_SECRET モード専用の色を付けたい場合は `BUSY_SECRET_COLOR` を設定してください。

### 参加ステータスによる除外

```javascript
const EXCLUDE_STATUS = {
  INVITED: true,  // 招待のみ（未承認）はコピーしない
  NO: false,      // 不参加を除外するなら true
  MAYBE: false,   // 未定を除外するなら true
};
```

自分が「招待のみ（未承認）」の予定はデフォルトでコピーされません。  
必要に応じて `NO` や `MAYBE` も除外できます。

### ソースタグによる除外

```javascript
const SOURCE_EXCLUDE_BY_TAGS = true;
const SOURCE_EXCLUDE_TAGS = [MIRROR_TAG];
const SOURCE_EXCLUDE_FIELDS = ['description'];
```

ソースイベントの本文・タイトル・場所に特定のタグ（例: `[MIRRORED_BY_GAS]`）が含まれている場合はコピーされません。

### 削除戦略

```javascript
const DEDICATED_TARGET = true;
```

- `true`: 統合先は専用 → 期間内の予定をすべて削除して再作成（タグ不要）
- `false`: 混在 → このスクリプトが作成したタグ付き予定のみ削除

## 🚀 実行方法

- `syncOnce()` を手動実行 → 予定がコピーされます。
- 定期同期したい場合は `createTriggerEveryHour()` を実行してトリガーを作成します。

## 📝 注意点

- 初回実行時に認可ダイアログが表示されるので、Google カレンダー操作権限を許可してください。
- 大量の予定を扱う場合、Google のレート制限に注意してください。必要に応じて同期範囲や実行間隔を調整してください。
- このスクリプトは「コピー」動作のみを行い、双方向同期や更新検知は行いません。
