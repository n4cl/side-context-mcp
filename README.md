side-context-mcp (WIP)
===

ローカル開発中の「やることメモ」を、LLMエージェントと人間の両方で安全に共有するための小さなコンテキストサーバー。

- リポジトリには入れたくない「やることメモ」や思考ログを、別の場所で管理する
- LLMにとっては「現在のエントリ状態とコンテキストの基準情報」
- 人間にとっては「LLMが今なにしてるか」「何に注目しているか」をリアルタイムで監視する窓

> 目標は、"開発の現場メモ" を git / PR / Issue に汚さずに、でもエージェントと人間の間で共有できるようにすること。

## 背景 / Motivation

通常の開発フローでは、直近の検証メモや「次これやる」といった、ラフなやることメモはローカルなメモや頭の中に存在することが多い。

ただ、LLMに開発を手伝わせようとすると問題が出る：

- LLMは「今なにをやってるのか」「何がブロックなのか」を常に知っていてほしい
- でも、それをリポジトリ内のファイルで管理すると…
  - git未追跡ファイルでもLLMは勝手にPRやIssueに言及してしまうことがある
  - .gitignore に入れると今度はLLMがそのファイルを読めなかったりする
- さらに、途中経過のメモは他のメンバーに見せたい内容じゃないことも多い（愚直な試行錯誤・ワークアラウンド・「とりあえずこうした」など）

**side-context-mcp の狙いは、ここをうまく分離すること。**

- 開発中のやることメモ / 思考ログを、リポジトリ外に保管する
- それを LLM が正式な「状態」として参照する
- かつ、人間もそれをリアルタイムで監視できる

これにより：
- LLMと人間が「いま何をやってるのか」でズレない
- PRやIssueには必要な範囲だけを出せる
- でもローカルの思考ログは漏れない・gitを汚さない

詳しい仕様は `docs/system_design.md` を参照してください。

## インストールと実行

1. 依存関係のインストール

   ```bash
   pnpm install
   ```

2. TypeScript のビルド

   ```bash
   pnpm build
   ```

3. CLI の実行

   ビルド後はリポジトリ直下で以下のように実行できます。

   ```bash
   node dist/bin/side-context-mcp.js <command> [options]
   ```

## Codex への登録例

Codex の `config.toml` に以下のようなエントリを追加すると、MCP サーバーとして利用できます。パスは環境に合わせて `~/side-context-mcp/dist/bin/side-context-mcp.js` のように書き換えてください。

```toml
[mcp_servers.side_context]
command = "node"
args = [
  "/path/to/side-context-mcp/dist/bin/side-context-mcp.js",
  "server"
]
# データ保存先を変えたい場合は環境変数で指定できます
# env = { SIDE_CONTEXT_MCP_HOME = "/path/to/storage" }
```

Codex を再起動すると `side_context` サーバーとして登録され、`createEntries` や `listEntries` などのツールを呼び出せるようになります。

## CLI の使い方

`side-context-mcp` はサーバー起動に加えて、サブコマンドでストレージ操作を行えます。

```
# 既定のサーバー起動（従来通り）
side-context-mcp

# サーバーを明示的に起動
side-context-mcp server --transport stdio

# やることエントリを追加
side-context-mcp create --title "朝会メモ" --note "共有事項を追記する"

# 一覧表示（完了済みを含める）
side-context-mcp list --include-done --format table

# アクティブエントリの切り替えと確認
side-context-mcp active set entry_00012
side-context-mcp active show

# メモ＆ステータス更新
side-context-mcp update entry_00012 --note "レビュー待ち" --status doing

# エントリ削除
side-context-mcp delete entry_00010 entry_00011
```

共通オプション:

- `--home <path>`: `SIDE_CONTEXT_MCP_HOME` を上書きします。
- `--json`: 出力形式を JSON 固定にします（`list` や `active show` など）。

CLI は `SIDE_CONTEXT_MCP_HOME` を参照し、未設定の場合は `~/.side-context-mcp` を利用します。

## 環境変数

- `SIDE_CONTEXT_MCP_HOME`
  - データ保存先を変更したい場合に設定します。
  - 未設定または空文字の場合は `~/.side-context-mcp` が使用されます。
