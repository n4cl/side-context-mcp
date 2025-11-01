**side-context-mcp v0 System Design（TODO モデル案）**
===

## 0. Overview / Goal

side-context-mcp は、LLM エージェントと人間が共有する軽量な TODO／メモをローカルで管理する MCP サーバーです。目的は次の 3 点です。

- リポジトリに残したくないラフな TODO や思考メモを外部に退避する
- エージェントが読み書きしやすい JSON 形式で状態を保持する
- 必要に応じて Markdown ビューで「今注目している項目」を可視化する

本設計では従来の「厳密なタスク管理」から離れ、ゆるい TODO リストにフォーカスします。


## 1. ディレクトリ構成 / 永続化

既定ではホームディレクトリ配下にデータを保存する。環境変数 `SIDE_CONTEXT_MCP_HOME` によりルートディレクトリを上書きできる。

```
~/.side-context-mcp/
├── active.json             # アクティブなエントリ ID を保持
├── entries/                # 各エントリ（TODO）の JSON
│   ├── entry_00001.json
│   ├── entry_00002.json
│   └── ...
└── views/
    └── active-entry.md     # 人間向けビュー
```

- `active.json` – 現在フォーカスしているエントリ ID と最終更新時刻を保持。例:

  ```json
  {
    "entryId": "entry_00003",
    "updatedAt": "2025-10-29T10:20:00+09:00"
  }
  ```

- `entries/<entryId>.json` – TODO やメモ 1 件分を JSON で保存。
- `views/active-entry.md` – アクティブエントリの内容を Markdown で可視化。


## 2. EntryRecord スキーマ

TODO を扱う最小限のスキーマを以下に定義する。ステータスは 3 種類のみ。

```ts
type EntryStatus = "todo" | "doing" | "done";

interface EntryRecord {
  entryId: string;
  title: string;     // TODO やメモの本文に相当するゆるいタイトル
  note: string;      // 補足メモ（空文字許容、Markdown など自由形式）
  status: EntryStatus;
  createdAt: string; // ISO8601
  updatedAt: string; // ISO8601
}
```

方針:

- `title` は必須・1 行程度のゆるい TODO を想定。
- `note` は任意（空文字または `""` で保持）。
- ステータスは `todo`（未着手）、`doing`（作業中）、`done`（完了）の 3 段階。
- 追加情報（優先度・タグ等）は今後の拡張余地とし、現段階では扱わない。


## 3. アクティブエントリ

- 「現在フォーカスしている TODO」を 1 件だけ選択し、`active.json` に保存する。
- `setActiveEntry(entryId)` で切り替え。`null` を設定するとアクティブなし状態にできるようにする。
- アクティブ切り替えでは自動で `status` を変更せず、ユーザー／エージェントが明示的に `doing` を設定する運用とする。


## 4. 人間向けビュー `active-entry.md`

アクティブエントリが更新されるたびに Markdown ビューを再生成する。表示例：

```markdown
# Active Entry: [entry_00042] 朝会で共有するトピック整理
Status: doing
Last Updated: 2025-10-29T10:20:00+09:00

## Note
- 進捗報告: API 実装 80%
- QA からの質問を共有する
```

表示項目（暫定）:

- `entryId`
- `status`
- `title`
- `note`（空の場合は `(none)` と表示）
- `updatedAt`

再生成トリガー:

- `setActiveEntry` を呼び出したとき
- アクティブエントリの `title` / `note` / `status` を更新したとき


## 5. MCP API（暫定案）

新しい TODO モデルに合わせ、以下の操作を提供する想定。

1. `createEntries(entries)`  
   - 入力: `entries: Array<{ title: string; note?: string }>`
   - 挙動: まとめてエントリを作成。`note` 未指定時は空文字、`status` は `todo` で初期化。
   - 返却: `{ entryIds: string[] }`

2. `setActiveEntry(entryId | null)`  
   - アクティブエントリを切り替える。`null` で解除。
   - 返却: `EntryRecord | null`

3. `getActiveEntry()`  
   - 現在のアクティブエントリを取得。存在しない場合は `null`。

4. `updateEntry(entryId, { title?, note?, status? })`  
   - 指定エントリのフィールドを更新。複数項目を同時更新可能。
   - 返却: 更新後の `EntryRecord`

5. `listEntries()`  
   - すべてのエントリを軽量表示で返す。例: `{ entryId, title, status, updatedAt }`
   - フィルタ（`status` や文字列検索）は将来拡張とする。

6. （任意）`deleteEntry(entryId)` / `archiveEntry(entryId)`  
   - ニーズがあれば検討。初期実装では未対応でもよい。

既存の複雑なタスク API（ブロッカー管理、PR 連携など）は撤廃する。


## 6. ビュー生成ロジック

- アクティブエントリの変更操作（前節参照）時に `views/active-entry.md` を再生成。
- 表示テンプレートは固定化しておき、空の `note` は `(none)` と表示する。
- 将来的に複数ビュー（一覧など）が必要になった場合は `views/` 内に追加する。


## 7. 運用イメージ

- **人間**: `views/active-entry.md` を開いたまま、いま注目している TODO を確認。
- **LLM エージェント**: `createEntries` で TODO をまとめて登録し、進捗に応じて `updateEntry` でステータスやメモを更新。
- エントリを切り替えることで、人とエージェントの意図合わせをシンプルに保つ。


## 8. 実装メモ / 未決事項

- **サーバー形態**: MCP Server（stdio）を基本とし、必要に応じて HTTP/SSE も検討。
- **採番ルール**: `entry_<number>.json` 形式で連番管理。将来 `index.json` に次番号を格納する案もある。
- **書き込み手順**: 一時ファイルに JSON を書き出し、`rename` で差し替えることでアトミック性を担保。排他制御は単一プロセス前提で省略。
- **入力フォーマット**: `createEntries` の受け渡しは JSON 配列を基本とし、CLI からは YAML/Markdown などをパースして渡す拡張も検討。
- **削除／アーカイブ**: エントリの寿命管理（削除・アーカイブ・日付絞り込み）は今後の利用状況を見て追加する。
- **互換性**: 旧 Task モデルからの移行が必要な場合、変換スクリプトやマイグレーション手順を別途用意する。
