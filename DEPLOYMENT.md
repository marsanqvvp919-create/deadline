# 固定IP環境（Google Cloud Run / Render / VPS）へのデプロイガイド

楽楽販売などの厳格なIPアクセス制限（エラーコード7など）をクリアするため、**固定IP（静的IP）を持つホスティング環境**へ本システムをコンテナデプロイする手順です。

---

## 方法1: Google Cloud Run ＋ Cloud NAT（最も推奨・エンタープライズ向け）
Google Cloud Runはサーバーレスでありながら、**Cloud NAT**を組み合わせることで**完全な固定外向きIP（Static Egress IP）**を保持し、楽楽販売のIPホワイトリストに登録することができます。

### 手順:
1. **Google Cloud SDK (gcloud) のセットアップ**
   ```bash
   gcloud auth login
   gcloud config set project YOUR_GCP_PROJECT_ID
   ```

2. **コンテナイメージのビルド & Artifact Registryへのプッシュ**
   ```bash
   gcloud builds submit --tag gcr.io/YOUR_GCP_PROJECT_ID/nouki-kanri-app
   ```

3. **Cloud Runへのデプロイ**
   ```bash
   gcloud run deploy nouki-kanri-app \
     --image gcr.io/YOUR_GCP_PROJECT_ID/nouki-kanri-app \
     --platform managed \
     --region asia-northeast1 \
     --allow-unauthenticated \
     --set-env-vars VITE_RAKURAKU_BASE_URL=https://hnsibot.rakurakuhanbai.jp/ykbxg2a/,VITE_DATA_KEY=YOUR_RAKURAKU_TOKEN
   ```

4. **固定IP（Cloud NAT）の設定**
   - Google Cloudコンソールから「VPCネットワーク」>「Cloud NAT」を作成し、Cloud Runサービスが属するリージョンに固定外向きIP（静的外部IP）を割り当てます。
   - 表示された固定IPアドレスを**楽楽販売の管理者側（アクセス許可IP）に登録**してもらいます。

---

## 方法2: Render.com（手軽なマネージドDockerホスティング）
RenderなどのPaaSでもDockerデプロイが可能です（ただし固定IPが必要な場合は専用の固定IPオプションまたはStatic IPプランを選択してください）。

### 手順:
1. GitHubリポジトリに本プロジェクトのコードをプッシュします。
2. [Render Dashboard](https://dashboard.render.com/) にログインし、「New +」>「Web Service」を選択します。
3. GitHubリポジトリを接続します。
4. 設定:
   - **Environment**: `Docker`
   - **Region**: Tokyo (またはお好みのリージョン)
   - **Branch**: `main`
5. Environment Variablesに以下を設定:
   - `VITE_RAKURAKU_BASE_URL`: `https://hnsibot.rakurakuhanbai.jp/ykbxg2a/`
   - `VITE_DATA_KEY`: 楽楽販売トークン
6. 「Create Web Service」をクリックしてデプロイします。

---

## 方法3: さくらのVPS / AWS EC2（完全な固定IP・自社サーバー）
完全な固定IP（グローバルIP）を持つLinuxサーバー（さくらのVPS、AWS EC2等）に直接デプロイする場合：

1. サーバー（Ubuntu / AlmaLinux等）にSSH接続し、DockerおよびDocker Composeをインストールします。
2. リポジトリをクローンまたはアップロードします。
3. 環境変数ファイル（`.env`）を作成:
   ```env
   VITE_RAKURAKU_BASE_URL=https://hnsibot.rakurakuhanbai.jp/ykbxg2a/
   VITE_DATA_KEY=YOUR_RAKURAKU_TOKEN
   PORT=3000
   ```
4. Dockerコンテナのビルドと起動:
   ```bash
   docker build -t nouki-kanri .
   docker run -d -p 3000:3000 --env-file .env --restart always nouki-kanri
   ```
5. サーバーのグローバルIPアドレスを楽楽販売のIP制限ホワイトリストに登録します。
