import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { StaffGate } from './components/StaffGate';
import { PortalApp } from './portal/PortalApp';
import { WarehouseApp } from './warehouse/WarehouseApp';
import './index.css';

// /portal/〜 はお客様の管理画面、/warehouse/〜 は倉庫の担当者の画面（どちらも社内ログインとは別）。
// それ以外は社内画面で、社員共通パスワードでログインする
const portalMatch = window.location.pathname.match(/^\/portal\/([a-z0-9]+)\/?$/);
const warehouseMatch = window.location.pathname.match(/^\/warehouse\/([a-z0-9]+)\/?$/);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {portalMatch ? (
      <PortalApp slug={portalMatch[1]} />
    ) : warehouseMatch ? (
      <WarehouseApp slug={warehouseMatch[1]} />
    ) : (
      <StaffGate>
        <App />
      </StaffGate>
    )}
  </StrictMode>,
);
