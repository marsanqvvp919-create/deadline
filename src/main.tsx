import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { StaffGate } from './components/StaffGate';
import { PortalApp } from './portal/PortalApp';
import './index.css';

// /portal/〜 はお客様の管理画面（社内ログインとは別）。それ以外は社内画面で、社員共通パスワードでログインする
const portalMatch = window.location.pathname.match(/^\/portal\/([a-z0-9]+)\/?$/);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {portalMatch ? (
      <PortalApp slug={portalMatch[1]} />
    ) : (
      <StaffGate>
        <App />
      </StaffGate>
    )}
  </StrictMode>,
);
