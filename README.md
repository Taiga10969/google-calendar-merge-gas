# Google Calendar Merge (GAS)

Google Apps Script (GAS) で、複数の Google カレンダーを 1 つの「共有用カレンダー」に**片方向ミラー**するツールです。  
各ソースカレンダーごとにコピー度合い（モード）を **英語** で指定できます：

- `ALL` — タイトル・本文・場所をコピー  
- `TITLE_ONLY` — タイトルと時間のみコピー（本文・場所は空）  
- `BUSY_SECRET` — タイトルを **「予定あり」** に固定し、**非公開**イベントとしてコピー（本文・場所は空）

> ✅ **ゲストは一切コピーしません。** 作成時に `guests` を指定せず、さらに保険として作成後にゲストが存在すれば削除します。**招待メールが送信されることはありません。**

---

## Features

- 複数カレンダー → 共有用カレンダーへの一元ミラー（片方向）
- ソースごとにモードを英語で指定：`ALL` / `TITLE_ONLY` / `BUSY_SECRET`
- タイトル先頭に `[SourceCalendarName]` を自動付与（オプション）
- カラー（可能な場合のみ）をコピー
- 指定期間（デフォルト：過去30日〜未来180日）だけを再構築する安全な同期方式
- 定期トリガーで自動更新

---

## Repository Layout
```
.
├─ Code.gs # メインスクリプト（GAS）
├─ README.md # このファイル
└─ LICENSE # MIT 推奨
```

---

## Setup (Step by Step)

### 1) 共有用カレンダー（ターゲット）の作成
1. Google カレンダーを開く  
2. 左側「その他のカレンダー」→ `+` → **新しいカレンダーを作成**  
3. 名前：例「統合ビュー（共有用）」→ 作成  
4. 作成後、左側のそのカレンダー横の `︙` → **設定** → **カレンダーの統合** にある **カレンダーID** を控えます  
   - 例：`your-merged-calendar-id@group.calendar.google.com`  
   - ※「プライマリ（メイン）」カレンダーのIDは通常、**自分のメールアドレス** です

### 2) ソースカレンダー（統合したい元）の ID を控える
- 自分の「マイカレンダー」や追加したカレンダーについて、同様に  
  `︙` → **設定** → **カレンダーの統合** → **カレンダーID** を控えます
- 例：
  - `source1@gmail.com`（自分のメイン）
  - `team-project@group.calendar.google.com`（サブカレンダー）

### 3) GAS プロジェクトを作成
1. https://script.google.com/ → **新しいスクリプト**  
2. `Code.gs` にこのリポジトリの中身を貼り付け  
3. 次の設定を自分の環境に合わせて編集：

```javascript
// 共有用（ターゲット）
const TARGET_CAL_ID = 'your-merged-calendar-id@group.calendar.google.com';

// ソース（統合元）
const SOURCES = [
  { id: 'source1@gmail.com', mode: 'ALL' },
  { id: 'team-project@group.calendar.google.com', mode: 'TITLE_ONLY' },
  { id: 'personal-tasks@group.calendar.google.com', mode: 'BUSY_SECRET' },
];

// 同期ウィンドウ（必要に応じて調整可）
const WINDOW_PAST_DAYS = 30;
const WINDOW_FUTURE_DAYS = 180;

// タイトルに [SourceCalendarName] を付けるか
const TITLE_PREFIX_WITH_SOURCE = true;
