// 入荷・在庫・引当・出荷指示の「サンプルで見る」。オンのときは API に x-demo: 1 を付け、サーバーは実データと切り離したサンプルを返す
const KEY = 'inventoryDemo';
export function isInventoryDemo(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
export function setInventoryDemo(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {}
}
export const demoHeaders = (): Record<string, string> => (isInventoryDemo() ? { 'x-demo': '1' } : {});
