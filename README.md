# Google Calendar Merge (GAS)

Google Apps Script (GAS) を使って、複数の Google カレンダーを 1 つの「共有用カレンダー」に統合コピーするツールです。  
カレンダーごとにコピーの度合い（全て / タイトルだけ / 予定あり）を指定でき、ゲスト情報はコピーされません。

---

## ✨ 機能

- 複数のカレンダーを 1 つの共有用カレンダーに自動統合
- カレンダーごとに「コピー度合い」を指定可能
  - **全て**：タイトル・本文・場所をコピー
  - **タイトルだけ**：タイトルと時間のみコピー（本文・場所は空）
  - **予定あり**：タイトルを「予定あり」に置換し、イベントを非公開に設定
- ゲストはコピーされず、招待メールが送られることはありません。
- 定期的な自動実行（トリガー設定で 15〜60分ごとを推奨）

---

## 🚀 セットアップ

1. **統合先カレンダー（共有用）** を Google カレンダーで新規作成し、カレンダーIDを確認する。  
   - 設定 →「カレンダーの統合」→「カレンダーID」

2. **統合したいカレンダー** のIDを取得する。  

3. [Google Apps Script](https://script.google.com/) で新規プロジェクトを作成し、`Code.gs` に [このリポジトリのコード](./Code.gs) を貼り付ける。

4. `SOURCES` と `TARGET_CAL_ID` を自分の環境に合わせて編集する：
   ```javascript
   const TARGET_CAL_ID = 'your-merged-calendar-id@group.calendar.google.com';

   const SOURCES = [
     { id: 'source1@gmail.com', mode: '全て' },
     { id: 'your-second-calendar-id@group.calendar.google.com', mode: 'タイトルだけ' },
     { id: 'another@group.calendar.google.com', mode: '予定あり' },
   ];
