// お客様・倉庫に渡すURLの入口。本番（Cloud Run の長いURL）で開いていても、短い ship.no1.farm で渡す
export const PUBLIC_ORIGIN = window.location.hostname.endsWith('.run.app') ? 'https://ship.no1.farm' : window.location.origin;
