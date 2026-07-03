# SynapseRack Apps SDK

[English](README.md)

ノードベースVJ環境 **[SynapseRack](https://github.com/SainaKey/SynapseRack)** の中で動く、ウィンドウ付きJavaScriptアプリを作るためのSDKです。アプリの実体はただのHTML/JSフォルダ — ビルド不要、ツールチェーン不要、保存すれば即ホットリロード。アプリは `window.synapse` ブリッジを通じてホストと会話し、メディア再生、オフスクリーン合成、ユーザーのノードグラフへのテクスチャ公開、MIDI / LFO / オーディオへのパラメータバインドができます。

> **ステータス: v0プレビュー。** APIリファレンスは [`docs/SYNAPSE_API.md`](docs/SYNAPSE_API.md)。v1までに変更される可能性があります。

## アプリにできること

- **ウィンドウを開く**（`synapse.web.createWindow`）— 自作HTML UIはもちろん、ホストのライブテクスチャを表示するサーフェス（ポインタ転送つき）も置けます。
- **オフスクリーンレンダリング**（`synapse.render.*`）— メディアプレイヤー、本物のコンポジタレイヤー、8入力スタックミキサー、テキスト描画、FXシェーダーチェーン。すべて製品と同じエンジンコードで動き、公開するまでユーザーのレイヤースタックには現れません。
- **出力の公開** — `synapse.output.publish` で自分のテクスチャを `MediaOut` ノードにできます。ユーザーはそれをグラフのどこへでも配線でき、**配線はアプリのリロードやプロジェクトの保存/読込を跨いで維持されます**。
- **ホスト側バインディング**（`synapse.bindings`）— MIDI CC、テンポ同期LFO、オーディオフォロー。毎フレームのJavaScriptは不要です。
- **ノードグラフ操作**（`synapse.modules`）— ノード生成、メンバー設定、ポート接続。`synapse.modules.types()` で全ノードカタログを機械可読で取得できます（[人間可読版](docs/NODE_CATALOG.md)）。
- **アセット取り込み**（`synapse.assets`）— ネイティブファイルピッカー、自動フォーマット判定つきのパスインポート（HAP / VLC / 動画 / 画像 / シェーダー）、URLダウンロード。
- **状態の永続化** — アプリごとの `synapse.storage`（マシン単位）に加え、ユーザーのプロジェクトと一緒に復元されるインスタンス状態。
- **マルチインスタンス** — マニフェストで `"multiInstance": true` を宣言すると、起動のたびに独立したスロット（`appId`、`appId#2`、…）が立ちます。ウィンドウも出力もスロットごとに独立。

## アプリのインストール

1. SynapseRackで **Apps → Open Apps Folder** を開く（デフォルト: `C:\SainaWorks\SynapseRack\Apps\`）。
2. アプリのフォルダをコピーして置く（例: `samples/ab-deck-mixer/`）。
3. **Apps** メニューと **App Hub** に現れます。クリックで起動。

インストール＝フォルダを置くこと。パッケージングも登録も不要です。

## アプリの作成

最短ルートは **Apps → App Hub → New Project**。[テンプレート](template/)一式とAPIドキュメントのコピーがコードの隣に生成され、フォルダがdev-linkされます。以降は保存のたびに実行中のアプリがホットリロード（約1秒）され、keyedリソース（ウィンドウ、出力、あなたのMediaOutへのユーザー配線）はリロードを生き延びます。

手動で始める場合: [`template/`](template/) を好きな場所にコピーし、`synapse-app.json` の `id` と `name` を書き換えて、App Hub → Add Project でフォルダを追加してください。

### マニフェスト（`synapse-app.json`）

```json
{
    "id": "yourname.your-app",
    "name": "Your App",
    "version": "0.1.0",
    "entry": "index.html",
    "apiVersion": 0,
    "capabilities": [],
    "multiInstance": false
}
```

`id` はインストール済みアプリの中で一意である必要があります。`multiInstance` は任意（デフォルト `false`）。

## AIアシスタントと作る

このSDKのドキュメントは「そのままプロンプトに渡す」前提で書かれています。

- [`docs/SYNAPSE_API.md`](docs/SYNAPSE_API.md) — ブリッジ/SDKの完全リファレンス。これを貼って作りたいアプリを説明すれば、実用的なモデルならワンショットで動くアプリが出てきます。
- [`docs/synapse.d.ts`](docs/synapse.d.ts) — 全API呼び出しの正確なTypeScript型。
- [`docs/NODE_CATALOG.md`](docs/NODE_CATALOG.md) — `synapse.modules` が生成できる全ノードタイプ（ポート・設定可能メンバーつき）。実行中のノードレジストリから自動生成されています。

エージェント的なループには、SynapseRack本体の**開発モードMCPサーバー**が使えます（メニュー: *SynapseRack → Synapse Apps → MCP Server*。デフォルトOFF・ループバック限定・セッションごとのオプトイン）。`http://127.0.0.1:8765/` のJSON-RPCで `list_apps` / `invoke`（実行中アプリの任意のブリッジメソッド呼び出し）/ `read_console` / `reload_app` が使えるので、AIが生きているSynapseRackを直接操作・デバッグできます。

## サンプル

| サンプル | 見どころ |
| --- | --- |
| [`ab-deck-mixer`](samples/ab-deck-mixer/) | ネイティブファイル選択つきの2デッキ、トランスポート、MIDIバインド＋自動LFO付きA/Bクロスフェーダー、`Deck Mixer` 出力として公開。マルチインスタンス対応 — 独立したミキサーを何台でも。 |
| [`flappy-fx`](samples/flappy-fx/) | ジャンプするたびに選択レイヤーへFXがかかり、タップのリズムがグローバルBPMを動かす、遊べるゲーム。アプリは「パネル」ではなく「楽器」になれる、というデモ。 |

各サンプルフォルダは完結したアプリです。そのままAppsフォルダにコピーしてください。

## リポジトリ構成

```
docs/       APIリファレンス・ノードカタログ・TypeScript型定義（製品から生成したスナップショット）
template/   App Hubの「New Project」が生成する雛形 — 最小の動くアプリ
samples/    完結したサンプルアプリ（1フォルダ=1アプリ）
```
