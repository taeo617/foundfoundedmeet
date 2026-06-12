import webpush from 'web-push';
import { Jimp } from 'jimp';
import fs from 'fs';
import path from 'path';

const vapidKeys = webpush.generateVAPIDKeys();
console.log('=== VAPID KEYS ===');
console.log('Public Key:', vapidKeys.publicKey);
console.log('Private Key:', vapidKeys.privateKey);
console.log('==================');

// Save the keys to a .env.local file
fs.writeFileSync('.env.local', `VITE_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}\nVAPID_PRIVATE_KEY=${vapidKeys.privateKey}\n`, { flag: 'a' });
console.log('Saved VAPID keys to .env.local');

async function createIcon(size) {
  const image = new Jimp({ width: size, height: size, color: '#1a1a1a' });
  await image.write(`public/icon-${size}.png`);
  console.log(`Created public/icon-${size}.png`);
}

createIcon(192);
createIcon(512);
