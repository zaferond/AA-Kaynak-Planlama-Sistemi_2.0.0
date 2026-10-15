#!/bin/bash
set -e
cd "$(dirname "$0")"
trap 'echo "İşlem durdu. Yukarıdaki hata mesajını kontrol edin."' ERR
if ! command -v node >/dev/null; then echo 'Node.js 24 kurun ve Terminali yeniden açın.'; exit 1; fi
node -e "if(Number(process.versions.node.split('.')[0])<24){console.error('Node.js 24 veya daha yenisi gerekir.');process.exit(1)}"
if ! command -v npm >/dev/null; then echo 'npm bulunamadı. Node.js kurulumunu kontrol edin.'; exit 1; fi
node backend/setup.mjs
node backend/ensure-dependencies.mjs
npm run build
npm start
