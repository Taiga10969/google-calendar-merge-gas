# Google Calendar Merge (GAS)

Google Apps Script (GAS) を使って、複数の Google カレンダーを 1 つの「共有用カレンダー」に自動統合するスクリプトです。  
ソースごとにコピーの度合い（モード）を指定でき、**ゲストは一切コピーされず通知メールも送られません**。  

---

## ✨ Features

- 複数カレンダーをまとめて 1 つの「統合ビュー」を作成
- ソースごとにモードを指定可能
  - `ALL` : タイトル・本文・場所をコピー
  - `TITLE_ONLY` : タイトルと時間のみコピー（本文・場所は空）
  - `BUSY_SECRET` : タイトルを `[prefix] 予定あり` に置換し、**非公開イベント**としてコピー（prefix はソースごとに設定可能）
- **ゲストはコピーしない**（オプション指定なし、作成後も removeGuest で削除）
- 統合先カレンダーは常にソースの「最新スナップショット」になる（削除・更新も反映）
- 定期実行（時間トリガー）により自動同期

---

## 🛠 Setup

### 1. 統合先（ターゲット）カレンダーの作成
1. Google カレンダー → 左「その他のカレンダー」→ `+` → **新しいカレンダーを作成**  
2. 名前例：`統合ビュー（共有用）`  
3. 設定 → **カレンダーの統合** → **カレンダー ID** をコピー  
   - 例: `xxxxxx@group.calendar.google.com`  
   - プライマリカレンダーの場合は自分の Gmail アドレスが ID

### 2. ソースカレンダー ID の取得
同様に対象となる各カレンダーの「設定」→「カレンダーの統合」→「カレンダー ID」を控える。  
例:
- `source1@gmail.com`
- `team-project@group.calendar.google.com`

### 3. スクリプトの導入
1. [Google Apps Script](https://script.google.com/) → 新しいプロジェクトを作成  
2. `Code.gs` に [このリポジトリのコード](./Code.gs) を貼り付け  
3. 以下を編集：

```javascript
// 統合先
const TARGET_CAL_ID = 'your-merged-calendar-id@group.calendar.google.com';

// ソース
const SOURCES = [
  { id: 'source1@gmail.com', mode: 'ALL' },
  { id: 'team-project@group.calendar.google.com', mode: 'TITLE_ONLY' },
  { id: 'private@group.calendar.google.com', mode: 'BUSY_SECRET', prefix: 'Private' }
];

// 同期期間（例：過去30日〜未来180日）
const WINDOW_PAST_DAYS = 30;
const WINDOW_FUTURE_DAYS = 180;

// 削除ポリシー
const DEDICATED_TARGET   = true;   // true=専用カレンダーとして運用（期間内の予定を全削除して再構築）
const ADD_MIRROR_TAG     = !DEDICATED_TARGET; // falseなら説明欄にタグを付与しない
```

### 4. 初回実行と認可
- `syncOnce()` を実行 → 認可ダイアログで Calendar API へのアクセスを許可

### 5. トリガー設定
- スクリプトエディタ → トリガー（時計アイコン）  
- 新規トリガー → 関数 `syncOnce` → 時間主導型 → 15〜60分ごと推奨

---

## 📖 Modes

- `ALL`  
  ソースイベントをほぼそのままコピー。本文や場所も保持。  
- `TITLE_ONLY`  
  タイトルと時間のみコピー。本文や場所は落とす。  
- `BUSY_SECRET`  
  タイトルを `[prefix] 予定あり` に変換し、**Visibility=PRIVATE** としてコピー。  
  - `prefix` を指定しない場合はソースカレンダー名が使われる。  
  - 例: `{ id: 'lab@group.calendar.google.com', mode: 'BUSY_SECRET', prefix: 'Lab' }` → `[Lab] 予定あり`

---

## 🔒 Privacy / Safety

- ゲスト情報は一切コピーされません。招待メールが送られることはありません。  
- `TITLE_ONLY` または `BUSY_SECRET` を使うことで詳細情報を隠せます。  
- `DEDICATED_TARGET = true` にすれば統合先カレンダーには **タグやソース行を一切残さず** クリーンに同期されます。  

---

## ⚠️ Limitations

- **片方向同期のみ**（ターゲットで編集しても次回同期で上書き）  
- 大量のイベントがある場合、GAS の実行時間上限に注意（期間を短縮 or トリガー間隔を調整）  
- 添付ファイルなど一部属性はコピー対象外  

---

## Example

```javascript
const SOURCES = [
  { id: 'my-primary@gmail.com', mode: 'ALL' },                    // 自分の予定は詳細コピー
  { id: 'team@group.calendar.google.com', mode: 'TITLE_ONLY' },   // チーム予定はタイトルだけ
  { id: 'private@group.calendar.google.com', mode: 'BUSY_SECRET', prefix: 'Private' } // 個人は予定あり
];
```

---

## License

MIT License
