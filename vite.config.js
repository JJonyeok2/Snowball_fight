import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build:single` 은 미리보기용으로 HTML 한 파일에 모두 담아 dist-single/ 에 만든다.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
  // npm run server 로 띄운 게임 서버에 개발 서버가 /ws 를 넘겨준다
  server: { proxy: { '/ws': { target: 'ws://localhost:8080', ws: true } } },
}));
