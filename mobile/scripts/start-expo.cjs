/**
 * Forces the Expo packager hostname to the LAN IPv4 of this PC.
 * Without this, Windows can sometimes expose exp://127.0.0.1,
 * which only works reliably on emulators.
 */
const { spawn } = require('child_process');
const { networkInterfaces } = require('os');
const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  /* dotenv optional */
}

function pickLanIPv4() {
  const nets = networkInterfaces();
  const scored = [];
  for (const name of Object.keys(nets)) {
    const nl = name.toLowerCase();
    const isLikelyLan =
      nl.includes('wi-fi') ||
      nl.includes('wifi') ||
      nl.includes('wlan') ||
      nl.includes('wireless') ||
      nl.includes('ethernet') ||
      nl.includes('gigabit') ||
      /^eth\d*$/.test(nl);
    for (const net of nets[name] || []) {
      const fam = net.family;
      if (fam !== 'IPv4' && fam !== 4) continue;
      if (net.internal) continue;
      const addr = String(net.address);
      if (addr.startsWith('169.254.')) continue;
      let score = 0;
      if (isLikelyLan) score += 200;
      if (addr.startsWith('192.168.')) score += 100;
      else if (addr.startsWith('10.')) score += 80;
      else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(addr)) score += 60;
      if (addr.startsWith('172.31.')) score -= 150;
      if (nl.includes('vethernet') || nl.includes('hyper-v') || nl.includes('virtualbox')) score -= 120;
      scored.push({ addr, score, name });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.addr ?? null;
}

const root = path.join(__dirname, '..');
const ip = pickLanIPv4();
const env = { ...process.env };
if (!env.REACT_NATIVE_PACKAGER_HOSTNAME && ip) {
  env.REACT_NATIVE_PACKAGER_HOSTNAME = ip;
  console.log(
    `\n\x1b[36m[NutrIA]\x1b[0m Expo usara la IP del PC en la red: ${ip} (Expo Go en el iPhone debe abrir exp://${ip}:8080)\n`,
  );
} else if (env.REACT_NATIVE_PACKAGER_HOSTNAME) {
  console.log(
    `\n\x1b[36m[NutrIA]\x1b[0m Packager hostname: ${env.REACT_NATIVE_PACKAGER_HOSTNAME} (.env o entorno)\n`,
  );
} else {
  console.warn(
    '\n\x1b[33m[NutrIA]\x1b[0m No se detecto IPv4 LAN. Si Expo Go falla, ejecuta: npm run start:tunnel\n',
  );
}

const extraArgs = process.argv.slice(2);
const child = spawn(
  'npx',
  ['expo', 'start', '--port', '8080', '--host', 'lan', ...extraArgs],
  { env, stdio: 'inherit', shell: true, cwd: root },
);

child.on('exit', (code) => process.exit(code == null ? 0 : code));
