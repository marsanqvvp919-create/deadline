// 配送会社（FedEx・DHL）の追跡API連携の基礎。
// 認証情報はサーバーだけで持ち（環境変数、または管理画面から保存したもの）、ブラウザには返さない。
// 応答は共通の形（CarrierStatus）に直して返す。

export type CarrierId = 'fedex' | 'dhl' | 'yamato' | 'sagawa' | 'jppost';
/** 国内配送（荷物追跡API https://trackingapi.jp/ で照会する運送会社） */
export const DOMESTIC_CARRIERS: CarrierId[] = ['sagawa', 'yamato', 'jppost'];

export interface CarrierCredentials {
  fedex?: { clientId: string; clientSecret: string; env: 'sandbox' | 'production' };
  dhl?: { apiKey: string };
  // 荷物追跡API（佐川・ヤマト・日本郵便）
  domestic?: { apiKey: string; secretKey: string };
}

export type NormalizedStatus = 'delivered' | 'in_transit' | 'exception' | 'pre_transit' | 'unknown';

export interface CarrierStatus {
  carrier: CarrierId;
  trackingNo: string;
  status: NormalizedStatus;
  statusText: string; // 配送会社の表示文言
  lastEventAt?: string; // ISO
  lastLocation?: string;
  deliveredAt?: string; // ISO
  estimatedDelivery?: string; // ISO
  fetchedAt: string;
  error?: string;
  arrivedJapan?: boolean; // 日本の拠点でのスキャンがある
  customsCleared?: boolean; // 通関が終わった（配送会社の記録から判断）
  customsClearedAt?: string; // 通関が終わった日時（ISO）
  domestic?: boolean; // 配達中・国内の配達店に到着
  notFound?: boolean; // 運送会社に番号が見つからない
  lookup?: 'found' | 'not_found' | 'out_of_scope'; // 画面に返すときの照会結果
}

// 配達中・国内配送店に到着を表す文言
const DOMESTIC_PATTERN = /配達中|配達のため|配達車|out for delivery|on fedex vehicle for delivery|with delivery courier|at local fedex facility|配達店|配送センターに到着|delivery facility/i;

export const NORMALIZED_LABEL: Record<NormalizedStatus, string> = {
  delivered: '配達完了',
  in_transit: '輸送中',
  exception: '要確認（通関・配達の例外）',
  pre_transit: '集荷前',
  unknown: '不明',
};

/** 追跡番号から配送会社を推定（明示されていればそれを使う） */
export function detectCarrier(trackingNo: string, courierHint?: string): CarrierId | null {
  // 番号の形を優先（楽楽販売の配送業者に入力違いがあるため）。形で決まらないときだけ配送業者を見る
  const clean = trackingNo.replace(/[\s-]/g, '');
  const hint = (courierHint || '').toLowerCase();
  const hintedIntl = hint.includes('fedex') || hint.includes('dhl');
  if (/^\d+$/.test(clean)) {
    // 12桁はヤマト・佐川など国内の宅配便にもある。配送業者が FedEx/DHL でない12桁は、FedEx の番号帯（7・8始まり）だけ FedEx とみなす
    if (clean.length === 12 && (hintedIntl || /^[78]/.test(clean))) return 'fedex';
    if (clean.length === 15) return 'fedex';
    if (clean.length === 10) return 'dhl';
    if (clean.length === 12) return null;
  }
  if (hint.includes('fedex')) return 'fedex';
  if (hint.includes('dhl')) return 'dhl';
  return null;
}

// ----------------------------------------------------------------------
// FedEx（OAuth のアクセストークンは1時間有効なので覚えておく）
// ----------------------------------------------------------------------
let fedexToken: { token: string; expiresAt: number; key: string } | null = null;

function fedexBase(env: 'sandbox' | 'production') {
  return env === 'production' ? 'https://apis.fedex.com' : 'https://apis-sandbox.fedex.com';
}

async function getFedexToken(cred: NonNullable<CarrierCredentials['fedex']>): Promise<string> {
  const key = `${cred.env}:${cred.clientId}`;
  if (fedexToken && fedexToken.key === key && Date.now() < fedexToken.expiresAt - 60000) return fedexToken.token;
  const res = await fetch(`${fedexBase(cred.env)}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cred.clientId,
      client_secret: cred.clientSecret,
    }).toString(),
    signal: AbortSignal.timeout(20000),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`FedEx 認証エラー: ${json?.errors?.[0]?.message || res.status}`);
  }
  fedexToken = { token: json.access_token, expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000, key };
  return fedexToken.token;
}

// 通関が終わったことを表す配送会社の文言（日本語・英語）
const CLEARED_PATTERN = /通関手続きが完了|通関が完了|clearance processing complete|cleared customs|customs clearance complete|international shipment release|通関手続き完了/i;

function normalizeFedex(trackingNo: string, r: any): CarrierStatus {
  const latest = r?.latestStatusDetail || {};
  const code = String(latest.code || latest.derivedCode || '').toUpperCase();
  const dates: any[] = r?.dateAndTimes || [];
  const pick = (type: string) => dates.find((d) => d.type === type)?.dateTime;
  const scan = (r?.scanEvents || [])[0];
  let status: NormalizedStatus = 'unknown';
  if (code === 'DL') status = 'delivered';
  else if (['DE', 'SE', 'CD', 'CA', 'RS'].includes(code)) status = 'exception';
  // OC（送り状作成）はまだ集荷されていない。PU（集荷）からは輸送中
  else if (code === 'OC' || /label created|ラベルを作成/i.test(String(latest.statusByLocale || latest.description || ''))) status = 'pre_transit';
  else if (code) status = 'in_transit';
  const loc = latest.scanLocation || scan?.scanLocation;
  const events: any[] = r?.scanEvents || [];
  const arrivedJapan =
    String(loc?.countryCode || '').toUpperCase() === 'JP' ||
    events.some((e) => String(e?.scanLocation?.countryCode || '').toUpperCase() === 'JP');
  // 通関完了：イベントコード CC（Cleared customs）か、通関完了の文言。配達完了も通関済みとみなす
  const clearedEvent = events.find(
    (e) =>
      String(e?.eventType || '').toUpperCase() === 'CC' ||
      CLEARED_PATTERN.test(`${e?.eventDescription || ''} ${e?.derivedStatus || ''}`)
  );
  const customsCleared = code === 'DL' || !!clearedEvent;
  const domestic =
    code === 'OD' ||
    (arrivedJapan && customsCleared) ||
    (arrivedJapan && DOMESTIC_PATTERN.test(`${latest.description || ''} ${latest.statusByLocale || ''} ${scan?.eventDescription || ''}`));
  const notFound = !!r?.error && /notfound|not found|invalid|見つけることができません/i.test(`${r.error.code || ''} ${r.error.message || ''}`);
  return {
    carrier: 'fedex',
    trackingNo,
    status,
    statusText: latest.statusByLocale || latest.description || code || '',
    lastEventAt: scan?.date,
    lastLocation: loc ? [loc.city, loc.countryCode].filter(Boolean).join(', ') : undefined,
    deliveredAt: pick('ACTUAL_DELIVERY'),
    estimatedDelivery: pick('ESTIMATED_DELIVERY'),
    fetchedAt: new Date().toISOString(),
    error: r?.error?.message,
    arrivedJapan,
    customsCleared,
    customsClearedAt: clearedEvent?.date,
    domestic,
    notFound,
  };
}

export async function trackFedex(cred: NonNullable<CarrierCredentials['fedex']>, trackingNos: string[]): Promise<CarrierStatus[]> {
  const token = await getFedexToken(cred);
  const results: CarrierStatus[] = [];
  // 1回のリクエストで最大30件
  for (let i = 0; i < trackingNos.length; i += 30) {
    const chunk = trackingNos.slice(i, i + 30);
    const res = await fetch(`${fedexBase(cred.env)}/track/v1/trackingnumbers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-locale': 'ja_JP' },
      body: JSON.stringify({
        includeDetailedScans: true,
        trackingInfo: chunk.map((n) => ({ trackingNumberInfo: { trackingNumber: n } })),
      }),
      signal: AbortSignal.timeout(30000),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`FedEx 追跡エラー: ${json?.errors?.[0]?.message || res.status}`);
    for (const c of json?.output?.completeTrackResults || []) {
      results.push(normalizeFedex(String(c.trackingNumber), (c.trackResults || [])[0]));
    }
  }
  return results;
}

/** 番号の照合用：出荷日・配達日・発送元と届け先の都市と国だけを返す（名前・住所の番地などは返さない） */
export async function fedexDetails(cred: NonNullable<CarrierCredentials['fedex']>, trackingNos: string[]) {
  const token = await getFedexToken(cred);
  const out: any[] = [];
  for (let i = 0; i < trackingNos.length; i += 30) {
    const chunk = trackingNos.slice(i, i + 30);
    const res = await fetch(`${fedexBase(cred.env)}/track/v1/trackingnumbers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ includeDetailedScans: false, trackingInfo: chunk.map((n) => ({ trackingNumberInfo: { trackingNumber: n } })) }),
      signal: AbortSignal.timeout(30000),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`FedEx 追跡エラー: ${json?.errors?.[0]?.message || res.status}`);
    for (const c of json?.output?.completeTrackResults || []) {
      const r = (c.trackResults || [])[0] || {};
      const place = (a: any) => [a?.city, a?.stateOrProvinceCode, a?.countryCode].filter(Boolean).join(', ');
      const date = (type: string) => (r.dateAndTimes || []).find((x: any) => x.type === type)?.dateTime || '';
      out.push({
        trackingNo: String(c.trackingNumber),
        found: !r.error,
        status: r.latestStatusDetail?.description || r.error?.code || '',
        shipDate: date('SHIP') || date('ACTUAL_PICKUP'),
        deliveredAt: date('ACTUAL_DELIVERY'),
        from: place(r.shipperInformation?.address) || place(r.originLocation?.locationContactAndAddress?.address),
        to: place(r.recipientInformation?.address) || place(r.destinationLocation?.locationContactAndAddress?.address),
        packages: r.packageDetails?.count || '',
        weightKg: (r.packageDetails?.weightAndDimensions?.weight || []).find((w: any) => w.unit === 'KG')?.value || '',
      });
    }
  }
  return out;
}

// ----------------------------------------------------------------------
// DHL（Shipment Tracking - Unified。1件ずつ問い合わせる）
// ----------------------------------------------------------------------

function normalizeDhl(trackingNo: string, s: any): CarrierStatus {
  const st = s?.status || {};
  const code = String(st.statusCode || '').toLowerCase();
  const events: any[] = Array.isArray(s?.events) ? s.events : [];
  const placeOf = (e: any) => String(e?.location?.address?.addressLocality || '');
  const arrivedJapan = [st, ...events].some((e) => /JAPAN/i.test(placeOf(e)));
  const clearedEvent = events.find((e) => CLEARED_PATTERN.test(`${e?.description || ''} ${e?.status || ''}`));
  const customsCleared = code === 'delivered' || !!clearedEvent;
  const domestic =
    (arrivedJapan && customsCleared) || (arrivedJapan && DOMESTIC_PATTERN.test(`${st.description || ''} ${st.status || ''}`));
  const map: Record<string, NormalizedStatus> = {
    delivered: 'delivered',
    transit: 'in_transit',
    'pre-transit': 'pre_transit',
    failure: 'exception',
  };
  // 状態コードが「輸送中」のままでも、説明が「配達完了」なら配達完了とする
  const deliveredByText = /^配達完了|^delivered/i.test(String(st.description || st.status || '').trim());
  return {
    carrier: 'dhl',
    trackingNo,
    status: deliveredByText ? 'delivered' : map[code] || 'unknown',
    statusText: st.description || st.status || code,
    lastEventAt: st.timestamp,
    lastLocation: st.location?.address?.addressLocality,
    deliveredAt: code === 'delivered' || deliveredByText ? st.timestamp : undefined,
    estimatedDelivery: s?.estimatedTimeOfDelivery,
    fetchedAt: new Date().toISOString(),
    arrivedJapan,
    customsCleared,
    customsClearedAt: clearedEvent?.timestamp,
    domestic,
  };
}

// DHL の無料枠は1日あたりの回数が少ない。上限に当たったら、しばらく問い合わせを止める
export let dhlPausedUntil = 0;

export async function trackDhl(cred: NonNullable<CarrierCredentials['dhl']>, trackingNos: string[]): Promise<CarrierStatus[]> {
  const results: CarrierStatus[] = [];
  if (Date.now() < dhlPausedUntil) {
    throw new Error('DHL の回数上限に達したため、しばらく取得を止めています（1日の無料枠）');
  }
  for (const n of trackingNos) {
    const res = await fetch(`https://api-eu.dhl.com/track/shipments?trackingNumber=${encodeURIComponent(n)}&language=ja`, {
      headers: { 'DHL-API-Key': cred.apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    const json: any = await res.json().catch(() => ({}));
    if (res.status === 429) {
      // 回数上限：ここまでの結果は返し、1時間は問い合わせない
      dhlPausedUntil = Date.now() + 60 * 60 * 1000;
      if (results.length === 0) throw new Error('DHL の回数上限に達しました（1日の無料枠）。時間をおいて再度お試しください');
      break;
    }
    if (res.status === 404) {
      results.push({
        carrier: 'dhl',
        trackingNo: n,
        status: 'unknown',
        statusText: '見つかりません',
        error: 'DHL に該当なし',
        notFound: true,
        fetchedAt: new Date().toISOString(),
      });
    } else if (!res.ok) {
      throw new Error(`DHL 追跡エラー: ${json?.detail || json?.title || res.status}`);
    } else {
      results.push(normalizeDhl(n, (json.shipments || [])[0]));
    }
    // DHL の無料枠は回数制限が厳しいので間隔をあける
    await new Promise((r) => setTimeout(r, 300));
  }
  return results;
}

// ----------------------------------------------------------------------
// 接続テスト：FedEx はトークン取得、DHL はテスト用の番号で1回問い合わせる
// ----------------------------------------------------------------------
export async function testCarrier(carrier: CarrierId, cred: CarrierCredentials, sampleTrackingNo?: string): Promise<string> {
  if (carrier === 'fedex') {
    if (!cred.fedex) throw new Error('FedEx の認証情報が未設定です');
    fedexToken = null;
    await getFedexToken(cred.fedex);
    if (sampleTrackingNo) {
      const [r] = await trackFedex(cred.fedex, [sampleTrackingNo]);
      return `認証に成功しました。${sampleTrackingNo}：${r ? NORMALIZED_LABEL[r.status] + '（' + r.statusText + '）' : '結果なし'}`;
    }
    return '認証に成功しました（アクセストークンを取得できました）';
  }
  if (!cred.dhl) throw new Error('DHL の API Key が未設定です');
  const n = sampleTrackingNo || '00340434292135100186';
  const res = await fetch(`https://api-eu.dhl.com/track/shipments?trackingNumber=${encodeURIComponent(n)}`, {
    headers: { 'DHL-API-Key': cred.dhl.apiKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 401 || res.status === 403) throw new Error('DHL 認証エラー（API Key を確認してください）');
  if (res.status === 404) return '認証に成功しました（テスト番号は見つかりませんでしたが、API Key は有効です）';
  if (!res.ok) throw new Error(`DHL エラー: ${res.status}`);
  return '認証に成功しました';
}

// ----------------------------------------------------------------------
// 国内配送（荷物追跡API https://trackingapi.jp/）：佐川・ヤマト・日本郵便。1回50件まで、件数で課金（無料は月3,000件）
// ----------------------------------------------------------------------
const TRACKINGAPI_BASE = 'https://api.trackingapi.jp';
const TRACKINGAPI_CODE: Record<string, string> = { sagawa: 'sagawa', yamato: 'yamato', jppost: 'post' };
export let domesticQuota: { limit?: number; used?: number; remaining?: number; resetAt?: string } = {};

function domesticAuth(cred: NonNullable<CarrierCredentials['domestic']>) {
  return { Authorization: `Bearer ${cred.apiKey}:${cred.secretKey}`, 'Content-Type': 'application/json' };
}

function pickProgress(progresses: any[]): { at?: string; place?: string; text?: string } {
  const list = Array.isArray(progresses) ? progresses : [];
  const last = list[list.length - 1] || list[0];
  if (!last || typeof last !== 'object') return {};
  const at = last.date || last.datetime || last.dateTime || last.time || last.timestamp;
  const place = last.place || last.location || last.office || last.branch || last.storeName;
  const text = last.status || last.statusText || last.description || last.detail;
  return { at: at ? String(at) : undefined, place: place ? String(place) : undefined, text: text ? String(text) : undefined };
}

function toIsoMaybe(v?: string): string | undefined {
  if (!v) return undefined;
  const t = new Date(v.replace(/\//g, '-').replace(' ', 'T'));
  return isNaN(t.getTime()) ? undefined : t.toISOString();
}

function normalizeDomestic(carrier: CarrierId, trackingNo: string, r: any): CarrierStatus {
  const fetchedAt = new Date().toISOString();
  if (!r?.success) {
    const code = String(r?.error?.code || '');
    return {
      carrier,
      trackingNo,
      status: 'unknown',
      statusText: code === 'NOT_FOUND' ? '見つかりません' : r?.error?.message || code || '取得できませんでした',
      error: r?.error?.message || code || 'error',
      notFound: code === 'NOT_FOUND' || code === 'INVALID_TRACKING_NUMBER',
      fetchedAt,
    };
  }
  const d = r.data || {};
  const code = String(d.deliveryStatus || 'UNKNOWN').toUpperCase();
  const map: Record<string, NormalizedStatus> = {
    REGISTERED: 'pre_transit',
    PICKED_UP: 'in_transit',
    IN_TRANSIT: 'in_transit',
    OUT_FOR_DELIVERY: 'in_transit',
    DELIVERED: 'delivered',
    FAILED: 'exception',
    RETURNED: 'exception',
    HOLD: 'exception',
    CANCELLED: 'exception',
    UNKNOWN: 'unknown',
  };
  const status: NormalizedStatus = d.isDelivered ? 'delivered' : map[code] || 'unknown';
  const p = pickProgress(d.progresses);
  const lastAt = toIsoMaybe(p.at);
  return {
    carrier,
    trackingNo,
    status,
    statusText: String(d.deliveryStatusText || p.text || code),
    lastEventAt: lastAt,
    lastLocation: p.place,
    deliveredAt: status === 'delivered' ? lastAt : undefined,
    fetchedAt,
    // 国内配送はすでに日本国内・通関済み
    arrivedJapan: true,
    customsCleared: true,
    domestic: status !== 'pre_transit',
  };
}

export async function trackDomestic(
  cred: NonNullable<CarrierCredentials['domestic']>,
  carrier: CarrierId,
  trackingNos: string[]
): Promise<CarrierStatus[]> {
  const courierCode = TRACKINGAPI_CODE[carrier];
  if (!courierCode) return [];
  const results: CarrierStatus[] = [];
  for (let i = 0; i < trackingNos.length; i += 50) {
    const chunk = trackingNos.slice(i, i + 50);
    const res = await fetch(`${TRACKINGAPI_BASE}/v1/tracking/trace`, {
      method: 'POST',
      headers: domesticAuth(cred),
      body: JSON.stringify({ items: chunk.map((n) => ({ courierCode, trackingNumber: n })) }),
      signal: AbortSignal.timeout(30000),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json?.isSuccess === false) {
      throw new Error(`荷物追跡API エラー: ${json?.error?.message || json?.message || res.status}`);
    }
    const q = json?.apiKeyInfo?.quota || json?.data?.apiKeyInfo?.quota;
    if (q) domesticQuota = q;
    const list: any[] = json?.data?.results || [];
    list.forEach((r, idx) => {
      const n = String(r?.data?.trackingNumber || r?.trackingNumber || chunk[idx]);
      // 一時的なエラー（TRACKING_FAILED：運送会社のメンテナンスなど）も「エラー」として保存する。
      // 保存しないと、その運送会社の照会待ちのまま止まり、次の運送会社（ヤマト・日本郵便）に進めない。
      // 取り直しはサーバー側で12時間あけて行う
      results.push(normalizeDomestic(carrier, n, r));
    });
  }
  return results;
}

export async function testDomestic(cred: CarrierCredentials['domestic']): Promise<string> {
  if (!cred) throw new Error('荷物追跡API のキーが未設定です');
  const res = await fetch(`${TRACKINGAPI_BASE}/v1/usage`, { headers: domesticAuth(cred), signal: AbortSignal.timeout(20000) });
  const json: any = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw new Error('荷物追跡API 認証エラー（API Key・Secret Key を確認してください）');
  if (!res.ok) throw new Error(`荷物追跡API エラー: ${json?.error?.message || res.status}`);
  const q = json?.data?.quota || json?.quota || json?.data?.apiKeyInfo?.quota || json?.apiKeyInfo?.quota;
  if (q) domesticQuota = q;
  return q ? `認証に成功しました（今月 ${q.used ?? '?'}/${q.limit ?? '?'}件使用、残り${q.remaining ?? '?'}件）` : '認証に成功しました';
}

/** 接続テスト用：各運送会社の応答をそのまま（状況コード・エラーコード）返す */
export async function traceDomesticRaw(cred: NonNullable<CarrierCredentials['domestic']>, carrier: CarrierId, no: string): Promise<string> {
  const courierCode = TRACKINGAPI_CODE[carrier];
  const res = await fetch(`${TRACKINGAPI_BASE}/v1/tracking/trace`, {
    method: 'POST',
    headers: domesticAuth(cred),
    body: JSON.stringify({ items: [{ courierCode, trackingNumber: no }] }),
    signal: AbortSignal.timeout(30000),
  });
  const json: any = await res.json().catch(() => ({}));
  const r = json?.data?.results?.[0];
  if (!res.ok) return `HTTP ${res.status} ${json?.error?.code || ''} ${json?.error?.message || ''}`.trim();
  if (r?.success) return `${r.data?.deliveryStatus}（${r.data?.deliveryStatusText}）`;
  return `${r?.error?.code || '?'} ${r?.error?.message || ''}`.trim();
}
