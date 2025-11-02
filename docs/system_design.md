**side-context-mcp v0 System Design（やることメモモデル案）**
===

## 0. Overview / Goal

side-context-mcp は、LLM エージェントと人間が共有する軽量な「やることメモ」をローカルで管理する MCP サーバーです。目的は次の 3 点です。

- リポジトリに残したくないラフなやることメモや思考ログを外部に退避する
- エージェントが読み書きしやすい JSON 形式で状態を保持する
- 必要に応じて Markdown ビューで「今注目している項目」を可視化する

本設計では従来の「厳密なタスク管理」から離れ、ゆるいやることリストにフォーカスします。


## 1. ディレクトリ構成 / 永続化

既定ではホームディレクトリ配下にデータを保存する。環境変数 `SIDE_CONTEXT_MCP_HOME` によりルートディレクトリを上書きできる。

```
~/.side-context-mcp/
├── active.json             # アクティブなエントリ ID を保持
├── entries/                # 各エントリ（やることメモ）の JSON
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

- `entries/<entryId>.json` – やることメモ 1 件分を JSON で保存。
- `views/active-entry.md` – アクティブエントリの内容を Markdown で可視化。


## 2. EntryRecord スキーマ

やることメモを扱う最小限のスキーマを以下に定義する。ステータスは 3 種類のみ。

```ts
type EntryStatus = "todo" | "doing" | "done";

interface EntryRecord {
  entryId: string;
  title: string;     // やることメモの本文に相当するゆるいタイトル
  note: string;      // 補足メモ（空文字許容、Markdown など自由形式）
  status: EntryStatus;
  createdAt: string; // ISO8601
  updatedAt: string; // ISO8601
}
```

方針:

- `title` は必須・1 行程度のゆるいやることメモを想定。
- `note` は任意（空文字または `""` で保持）。
- ステータスは `todo`（未着手）、`doing`（作業中）、`done`（完了）の 3 段階。
- 追加情報（優先度・タグ等）は今後の拡張余地とし、現段階では扱わない。


## 3. アクティブエントリ

- 「現在フォーカスしているやること」を 1 件だけ選択し、`active.json` に保存する。
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


## 5. MCP API

新しいやることメモモデルに合わせ、以下の操作を提供する想定。

1. `createEntries(entries)`  — やることエントリをまとめて登録する。
2. `setActiveEntry(entryId | null)`  — アクティブエントリを切り替える。
3. `getActiveEntry()` — 現在のアクティブエントリを参照する。
4. `updateEntry(entryId, { note?, status? })` — メモとステータスを更新する。
5. `listEntries()` — エントリ一覧を軽量サマリーで取得する。
6. `deleteEntries(entryIds)` — 指定したエントリをまとめて削除する。

各ツールの詳細仕様は「10. MCP ツール詳細」を参照。

7. （暫定）`archiveEntry(entryId)`
   - ニーズがあれば検討。初期実装では未対応でもよい。

既存の複雑なタスク API（ブロッカー管理、PR 連携など）は撤廃する。


## 6. ビュー生成ロジック

- アクティブエントリの変更操作（前節参照）時に `views/active-entry.md` を再生成。
- 表示テンプレートは固定化しておき、空の `note` は `(none)` と表示する。
- 将来的に複数ビュー（一覧など）が必要になった場合は `views/` 内に追加する。
- 削除処理でアクティブエントリが無効になった際も `(none)` 表示に切り替える。
- `updateEntry` でアクティブエントリの `note` や `status` が変わった場合もビューを更新する。


## 7. 運用イメージ

- **人間**: `views/active-entry.md` を開いたまま、いま注目しているやることを確認。
- **LLM エージェント**: `createEntries` でやることメモをまとめて登録し、進捗に応じて `updateEntry` でステータスやメモを更新。
- エントリを切り替えることで、人とエージェントの意図合わせをシンプルに保つ。
- CLI からも `side-context-mcp` ツールを用いてエントリ作成・一覧取得・更新・削除・アクティブ操作が可能。


## 8. 実装メモ / 未決事項

- **サーバー形態**: MCP Server（stdio）を基本とし、必要に応じて HTTP/SSE も検討。
- **採番ルール**: `entry_<number>.json` 形式で連番管理。将来 `index.json` に次番号を格納する案もある。
- **書き込み手順**: 一時ファイルに JSON を書き出し、`rename` で差し替えることでアトミック性を担保。排他制御は単一プロセス前提で省略。
- **入力フォーマット**: `createEntries` の受け渡しは JSON 配列を基本とし、CLI からは YAML/Markdown などをパースして渡す拡張も検討。
- **削除／アーカイブ**: エントリの寿命管理（削除・アーカイブ・日付絞り込み）は今後の利用状況を見て追加する。
- **互換性**: 旧 Task モデルからの移行が必要な場合、変換スクリプトやマイグレーション手順を別途用意する。

## 9. CLI 設計概要

CLI サブコマンドは以下の方針で実装済み。サーバー起動に加えて、やることエントリの作成・閲覧・更新・削除・アクティブ切り替えを CLI 経由で操作できる。

- **entry server**
  - 既定の挙動はサーバー起動。`side-context-mcp`（引数なし）と `side-context-mcp server` のどちらでも stdio で MCP サーバーを開始できる。
  - オプション: `--transport stdio|httpStream`。

- **entry create**
  - `--title` / `--note` で単一エントリを追加。`--file <path>` で JSON 配列を読み込んで一括作成。
  - 出力: 作成された `entryIds` を JSON で返す（テキスト形式では ID とタイトルを列挙）。

- **entry list**
  - 保存済みエントリの要約を表示。`--include-done` と `--format json|table` をサポート。`table` 表示時は `entryId | status | title | updatedAt` の順で表示。

- **entry active**
  - サブサブコマンドで構成。
    - `side-context-mcp active show`: 現在のアクティブエントリを表示（`--json` で JSON 出力）。
    - `side-context-mcp active set <entryId>`: アクティブエントリを切り替える。
    - `side-context-mcp active clear`: アクティブエントリを解除。

- **entry update <entryId>**
  - `--note` / `--status` を指定してメモとステータスを更新。`--note ""` でメモを削除できる。
  - 出力: 更新後の `EntryRecord` を JSON（またはテキスト）で返す。

- **entry delete**
  - `side-context-mcp delete <entryId...>` で複数エントリを一括削除。`--stdin` を付けると標準入力の JSON 配列から ID リストを読み取る。
  - 削除結果として `deletedEntryIds` を JSON で返し、アクティブエントリが削除対象なら `(none)` に切り替える。

- **共通仕様**
  - `--home <path>` で `SIDE_CONTEXT_MCP_HOME` を上書き可能。未指定時は環境変数→既定パス（`~/.side-context-mcp`）の順に解決。
  - `--json` を指定すると各サブコマンドの出力を JSON 固定にする。
  - コマンドエラー時は `process.exitCode = 1` をセットし、メッセージを stderr に出力する。

## 10. MCP ツール詳細

### 10.1 `createEntries`

- **目的**: 1 回の呼び出しで複数のやることエントリを登録する。
- **入力**: `entries: Array<{ title: string; note?: string }>`。`title` は 1 行メモ、`note` は任意の補足テキスト。
- **処理**: `entries/` ディレクトリに JSON を生成し、`status = "todo"`、`note` 未指定時は空文字で保存する。
- **戻り値**: `{ entryIds: string[] }`。作成順に採番された ID を返す。
- **テスト観点**: 複数件作成時の連番・既存ファイルがある場合の継続採番・空配列エラーなど。

### 10.2 `setActiveEntry`

- **目的**: 現在注目しているエントリを切り替え、人間向けビューを最新化する。
- **入力**: `entryId: string | null`。文字列ならその ID をアクティブ化、`null` ならアクティブ解除。
- **処理**: `active.json` と `views/active-entry.md` を再生成する。存在しない ID を指定した場合はエラー。
- **戻り値**: 新しいアクティブエントリの `EntryRecord`、または解除時は `null`。
- **テスト観点**: 有効 ID の切り替え、解除時の `(none)` 表示、存在しない ID のエラー。

### 10.3 `getActiveEntry`

- **目的**: 現在のアクティブエントリを参照し、エージェントが次のアクションを判断できるようにする。
- **入力**: なし。
- **処理**: `active.json` を読み、登録済みエントリをロードして `EntryRecord` を返す。破損・未設定時は `null`。
- **戻り値**: `EntryRecord | null`。
- **テスト観点**: 正常取得、アクティブ未設定時の `null`、破損ファイルのフォールバック。

### 10.4 `updateEntry`

- **目的**: エントリのメモとステータスを更新する。
- **入力**: `entryId: string`、`note?: string`、`status?: "todo" | "doing" | "done"`。
- **処理**: 指定フィールドのみを上書きし、`updatedAt` を現在時刻に更新。アクティブなエントリならビューも再生成する。
- **戻り値**: 更新後の `EntryRecord`。
- **テスト観点**: note の上書き・空文字削除、status 変更、存在しない ID のエラー、アクティブビューの更新。

### 10.5 `listEntries`

- **目的**: エージェントが現状のタスク状況を把握しやすいように一覧を返す。
- **入力**: `includeDone?: boolean`。既定は `false` で `todo` / `doing` のみを返す。
- **処理**: `entries/` 以下の JSON を読み、軽量サマリー `{ entryId, title, status, updatedAt }` に変換。
- **戻り値**: サマリー配列。エントリがなければ空配列。
- **テスト観点**: 通常取得、空ストレージの挙動、`includeDone: true` での完了エントリ含め確認。

### 10.6 `deleteEntries`

- **目的**: 不要なエントリをまとめて削除し、アクティブ状態も整合させる。
- **入力**: `entryIds: string[]`。1 件以上必須で、重複があれば内部で除去。
- **処理**: 指定 ID のファイル存在を確認し、なければ `UserError`。正常時はファイル削除後、削除対象にアクティブ ID があれば `setActiveEntry(null)` を呼び出す。
- **戻り値**: `{ deletedEntryIds: string[] }`。実際に削除した ID を列挙。
- **テスト観点**: 正常削除、アクティブ解除の確認、存在しない ID / 空配列時のエラー、採番への影響確認。
