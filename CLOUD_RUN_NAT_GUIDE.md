# Google Cloud Run ＋ Cloud NAT 固定IP構築ガイド

Google Cloud Runから外部の楽楽販売APIへアクセスする際、**Cloud NAT**を経由させることで**1つの完全な固定外向きIP（Static Egress IP）**を固定し、楽楽販売側のIP制限（エラーコード7など）を完全にクリアするための実践ガイドです。

---

## 🏗 アーキテクチャの仕組み
1. **Cloud Run**: アプリケーションが稼働するサーバーレス環境。
2. **Serverless VPC Access Connector**: Cloud RunからVPCネットワークへ安全にトラフィックを流すブリッジ。
3. **Cloud NAT & Cloud Router**: VPCネットワークからのすべての外向き通信を、**固定の静的外部IPアドレス**に変換（NAT）して外部（楽楽販売）へ送信します。
4. **結果**: 楽楽販売側には常に「同じ固定IPアドレス」からのリクエストとして届くため、ホワイトリスト登録によって通信許可が通ります。

---

## 🚀 自動セットアップ・デプロイ手順

### 前提条件
- Google Cloud SDK (`gcloud`) がローカルPCまたはCloud Shellにインストールされていること。
- Google Cloudの課金（Billing）が有効なプロジェクトがあること。

### ステップ 1: プロジェクトIDの設定とログイン
```bash
gcloud auth login
gcloud config set project 取得したご自身のGCPプロジェクトID
```

### ステップ 2: 自動スクリプトの実行
プロジェクトルートにある自動セットアップ・デプロイ用スクリプトを実行します：
```bash
chmod +x ./scripts/gcp-deploy-with-static-ip.sh
./scripts/gcp-deploy-with-static-ip.sh 你的なGCPプロジェクトID asia-northeast1 nouki-kanri-app
```

### ステップ 3: 楽楽販売側への固定IP登録
スクリプト実行中にコンソール画面に以下のような**固定外向きIPアドレス**が出力されます：
```text
==========================================================
🎯 【重要】取得された固定外向きIPアドレス (Static Egress IP):
   XXX.XXX.XXX.XXX
   -> このIPアドレスを楽楽販売の管理者側へ連絡し、
      APIアクセスのホワイトリスト（許可IP）に登録してもらってください。
==========================================================
```
このIPアドレスを楽楽販売の担当者様にご連絡いただき、APIアクセス許可IP（ホワイトリスト）として登録していただいてください。

---

## 🔍 接続テスト & 診断
デプロイ完了後、Cloud Runの本番URLにアクセスし、システム内の **「接続診断」** またはデータ取得を実行すると、登録した固定IP経由で楽楽販売APIとの通信が正常に行われます。
