# SynapseRack MCPサーバー（開発モード）

*English version: [MCP_SERVER.en.md](MCP_SERVER.en.md)*

SynapseRack本体には、**稼働中のSynapseRackをAIアシスタントから直接操作するためのMCPサーバー**が同梱されています。Claude CodeなどのMCP対応アシスタントを接続すると、アプリのコードを「書いては起動して目視」する代わりに、**生きているラックに対して** アプリの状態確認・任意のブリッジAPI呼び出し・コンソール読み取り・ホットリロードができます。

> **ステータス: プロトタイプ（開発モード専用）。** ライブ本番環境で有効にすることは想定していません。

## できること

アプリ向けの4ツール（`invoke` が **`window.synapse` ブリッジの全メソッド**に届くため、実質的にアプリができることはすべて外部からできます）と、**ユーザーの見えているノードグラフ**を直接操作する `graph_*` 6ツールがあります。

| ツール | 引数 | 何をするか |
| --- | --- | --- |
| `list_apps` | なし | 稼働中の全アプリ（スロット単位）を列挙: `appId` / `instanceId` / `slot` / 表示名 / ライフサイクル状態 / `isReady` / プロジェクトフォルダ / ウィンドウID / 所有リソース数 |
| `invoke` | `{ appId, method, params? }` | 稼働中アプリのホストAPIで**任意のブリッジメソッド**を呼ぶ。`method` はJSと同じドット名（例 `app.ping`, `render.createText`, `bindings.midi`）。カタログは [`SYNAPSE_API.md`](SYNAPSE_API.md) |
| `read_console` | `{ appId, tail?=50, severity? }` | アプリのコンソールバッファ末尾を読む（AppHubのConsoleと同じもの）。`severity: "error"` などでフィルタ可 |
| `reload_app` | `{ appId }` | ホットリロード（HTML/JSをその場で再読込、キー付きリソースとユーザー配線は維持）。settle（`app.ready` またはタイムアウト）まで待って新しい状態を返す |

**グラフ操作（`graph_*`）** — アプリの隠しスコープではなく、**ノードエディタに見えているユーザーのアクティブグラフ**が対象です。GUI編集と同じプリミティブを使うので、AIが組んだノードはユーザーがそのままUndoできます:

| ツール | 引数 | 何をするか |
| --- | --- | --- |
| `graph_state` | なし | 全ノード（moduleId・型・表示名・座標・入出力ポート）＋全接続のスナップショット。**変更前に必ず呼んで実在するidを参照する** |
| `graph_node_types` | なし | 作成できる全ノードタイプ（GUIのノードブラウザと同じNodeLibrary由来）。詳細は [`NODE_CATALOG.md`](NODE_CATALOG.md) |
| `graph_create_node` | `{ type, x?, y? }` | ノード作成（typeは名前/id/C#型名、大文字小文字不問） |
| `graph_delete_node` | `{ nodeId }` | ノード削除（触れている接続ごと）。**破壊的 — 自分が作っていないノードは消す前にユーザーに確認を** |
| `graph_connect` | `{ fromNode, fromPort, toNode, toPort }` | 出力→入力ポートを接続（GUIドラッグと同じ型検証つき） |
| `graph_disconnect` | 同上 | 接続を解除 |

`invoke` でできることの例（＝ブリッジ全面なので抜粋です）:

- **グラフ構築**: `modules.create / set / connect`、`render.createPlayer / createStack / createText / createLayer`、`output.publish`
- **演出操作**: `layers.list / setOpacity`、`controls.setValue`、`bindings.midi / lfo / follow / list / remove`
- **状態確認・デバッグ**: `app.ping`、`storage.get / set`、作った直後のリソースのハンドル確認

エラーは構造化されて返ります（`{ code, message, hint }`）。メソッド名を打ち間違えると `hint` に「Did you mean: …?」が入るので、そのままAIに貼り戻すと自己修正できます。

## できないこと（正直リスト）

- **アプリの起動・停止・インストール** — 対象は「すでに稼働中」のアプリだけです。起動はAppsメニュー/AppHubから
- **値の読み戻し系のv0制約はそのまま** — ブリッジに無いものはMCP経由でも呼べません
- **イベント購読** — リクエスト/レスポンスのみ（SSEなし、`GET` は405）。`control.onChange` 等のイベントはアプリ内JSの世界です
- **Unityエディタ自体の操作** — Play Modeの開始やメニュー実行はできません
- **画面のキャプチャ** — 映像出力の目視確認は人間の仕事です

## 起動方法

**オフがデフォルトで、セッションごとに明示的にオンにします**（ポート番号だけは記憶されます。「オンだった状態」は絶対に持ち越されません）。

- **エディタ**: メニュー `SynapseRack > Synapse Apps > MCP Server > Start / Stop / Status`
- **エディタ＋プレイヤービルド共通**: AppHubのツールバーで **MCP Server (dev)** をチェック（ポート変更もここ。デフォルト `8765`）

起動するとConsole/ステータスラベルにエンドポイント（`http://127.0.0.1:8765/`）が表示されます。

## AIアシスタントからの接続

Claude Codeの場合:

```
claude mcp add --transport http synapserack http://127.0.0.1:8765/
```

以降のセッションで `synapserack` サーバーの全ツールが使えます。MCPのStreamable HTTPトランスポート（request/responseサブセット）を話せるクライアントなら他のものでも接続できます。

## 典型的な使い方

**1. アプリ開発ループ（本来の用途）**

1. AIが `main.js` を編集
2. `reload_app` → settle後の `state` / `isReady` を確認
3. `read_console { severity: "error" }` で失敗を検出
4. `invoke` で結果のグラフを突いて検証（例: `bindings.list` でバインドが張れたか）

「書く→保存→目で確認」のループが「書く→リロード→機械で検証」になります。

**2. 生きているラックのデバッグ**

実例: 「MIDIが効かない」の調査で、AIが `invoke` で稼働中アプリに `render.createText` → `bindings.midi` を仕込み、`read_console` で警告の有無を確認 — ハードウェアを触る前に「学習対象の登録までは正常」を数十秒で切り分けました。

**3. デモ・スモークテストの自動運転**

`list_apps` で状態を集め、`invoke` で一連のAPIを叩いて期待値と突き合わせる、簡易的な受け入れチェックに使えます。

## マルチインスタンスのアドレッシング

`multiInstance` アプリが複数スロットで動いているときは、`list_apps` が返す **`instanceId`**（`appId#slot`、slot 1は `appId` のまま）で指定します。素の `appId` はスロットが1つのときだけ通り、複数あると候補一覧つきのエラーが返ります。

## セキュリティ — 必読

- **ループバック限定**: `127.0.0.1` にのみバインドされます。ルーティング可能なインターフェースには決してバインドされません
- **認証なし**: ポートに届くローカルプロセスは誰でもラックを操作できます。**ポートフォワードしない・ループバックの外に出さない・使い終わったら切る**
- **オフがデフォルト**: 有効化はセッションごとの明示的な選択です

## 既知の挙動・トラブルシュート

- **エディタのドメインリロード（スクリプト再コンパイル）でサーバーは停止し、自動復帰しません**（仕様 — オンは常に明示的選択のため）。再度Start/トグルしてください
- リクエストがメインスレッドに30秒以内にサービスされないとタイムアウトエラーを返します（エディタが一時停止中・リロード中など）
- `GET` は405、JSON-RPC通知（idなし）は202（本文なし）を返します
