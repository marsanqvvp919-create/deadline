// 国際送料電卓（tools/shipping-calc）を、社内画面とは別のページとして /tools/shipping-calc/ に作る。
// もとは独立したアプリ（shipping-calc リポジトリ）で、動きはそのまま
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, 'tools/shipping-calc'),
  base: '/tools/shipping-calc/',
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'dist/tools/shipping-calc'),
    emptyOutDir: true,
  },
});
