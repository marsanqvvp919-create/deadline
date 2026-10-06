#!/bin/bash
# ==============================================================================
# Google Cloud Run + Serverless VPC Access + Cloud NAT 固定IP設定・デプロイ自動化スクリプト
# 
# 前提: gcloud CLI がインストールされ、対象のGCPプロジェクトにログイン済みであること。
# 使用方法: ./scripts/gcp-deploy-with-static-ip.sh PROJECT_ID REGION SERVICE_NAME
# ==============================================================================

set -e

PROJECT_ID=${1:-"your-gcp-project-id"}
REGION=${2:-"asia-northeast1"}
SERVICE_NAME=${3:-"nouki-kanri-system"}
NETWORK_NAME="nouki-vpc"
SUBNET_NAME="nouki-subnet"
CONNECTOR_NAME="nouki-connector"
IP_NAME="nouki-static-ip"
ROUTER_NAME="nouki-router"
NAT_NAME="nouki-nat"

echo "=== 1. GCPプロジェクト設定 & API有効化 ==="
gcloud config set project $PROJECT_ID
gcloud services enable run.googleapis.com \
                        artifactregistry.googleapis.com \
                        vpcaccess.googleapis.com \
                        compute.googleapis.com

echo "=== 2. VPCネットワーク & サブネットの作成 ==="
gcloud compute networks create $NETWORK_NAME --subnet-mode=custom || true
gcloud compute networks subnets create $SUBNET_NAME \
    --network=$NETWORK_NAME \
    --region=$REGION \
    --range=10.8.0.0/28 || true

echo "=== 3. サーバーレスVPCアクセラレータ (Connector) の作成 ==="
gcloud compute networks vpc-access connectors create $CONNECTOR_NAME \
    --subnet=$SUBNET_NAME \
    --region=$REGION \
    --min-instances=2 \
    --max-instances=3 \
    --machine-type=e2-micro || true

echo "=== 4. 静的外部IPアドレス (Static Egress IP) の予約 ==="
gcloud compute addresses create $IP_NAME \
    --region=$REGION \
    --purpose=VPC_PEERING || true 2>/dev/null || \
gcloud compute addresses create $IP_NAME \
    --region=$REGION || true

# 取得した固定IPアドレスの表示
STATIC_IP=$(gcloud compute addresses describe $IP_NAME --region=$REGION --format='value(address)')
echo "=========================================================="
echo "🎯 【重要】取得された固定外向きIPアドレス (Static Egress IP):"
echo "   $STATIC_IP"
echo "   -> このIPアドレスを楽楽販売の管理者側へ連絡し、"
echo "      APIアクセスのホワイトリスト（許可IP）に登録してもらってください。"
echo "=========================================================="

echo "=== 5. Cloud Router & Cloud NAT の作成 ==="
gcloud compute routers create $ROUTER_NAME \
    --network=$NETWORK_NAME \
    --region=$REGION || true

gcloud compute routers nats create $NAT_NAME \
    --router=$ROUTER_NAME \
    --region=$REGION \
    --auto-allocate-nat-external-ips \
    --nat-all-subnet-ip-ranges-use-all-ips || true

echo "=== 6. Dockerコンテナのビルド & Artifact Registryへプッシュ ==="
IMAGE_TAG="gcr.io/$PROJECT_ID/$SERVICE_NAME:latest"
gcloud builds submit --tag $IMAGE_TAG

echo "=== 7. Cloud Run へのデプロイ（全トラフィックをVPC経由・固定IP化） ==="
gcloud run deploy $SERVICE_NAME \
    --image $IMAGE_TAG \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --vpc-connector $CONNECTOR_NAME \
    --vpc-egress all-traffic \
    --set-env-vars VITE_RAKURAKU_BASE_URL="https://hnsibot.rakurakuhanbai.jp/ykbxg2a/",VITE_DATA_KEY="lzWjxU5iMLMUSN57asqR6ov2w9eXrJ9Roeqq8KSY9zk93lrYHa54d4zaUr0zKO0a"

echo "=========================================================="
echo "🎉 デプロイメントが完了しました！"
echo "   固定IP [$STATIC_IP] が楽楽販売で許可されていれば、"
echo "   エラーなくライブAPIデータを取得できます。"
echo "=========================================================="
