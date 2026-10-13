'use strict';

const path = require('path');
const { fs, log, util } = require('vortex-api');

let winapi;
try { winapi = require('winapi-bindings'); } catch (_) { /* Manual discovery remains available. */ }

const GAME_ID = 'deadspace3';
const GAME_NAME = 'Dead Space 3';
const GAME_EXE = 'deadspace3.exe';
const GAME_DATA = 'bigfile0.viv';
const STEAM_APP_ID = '1238060';
const TEXMOD_DIRECTORY = 'TexMod Packages';

const ROOT_FOLDERS = new Set([
  'plugins', 'scripts', 'reshade-shaders', 'reshade-presets', 'sweetfx',
  'textures', 'shaders', 'movies', 'data', 'bin', 'x86', 'x64',
  'texmod packages', 'mod documentation', 'core', 'support', '__overlay',
]);
const ROOT_EXTENSIONS = new Set([
  '.dll', '.asi', '.ini', '.cfg', '.conf', '.json', '.toml', '.yaml', '.yml',
  '.fx', '.fxh', '.preset', '.addon', '.addon32', '.tpf', '.viv', '.vp6',
]);
const REGISTRY_BASES = [
  'Electronic Arts\\Dead Space 3', 'Electronic Arts\\EA Games\\Dead Space 3',
  'EA Games\\Dead Space 3', 'Origin Games\\Dead Space 3',
];
const REGISTRY_VALUES = ['Install Dir', 'InstallDir', 'Install Path', 'InstallPath', 'InstallLocation', 'DisplayIcon', 'Path'];
const LIBRARIES = [
  '', 'EA Games', 'Origin Games', 'Electronic Arts', 'Games',
  'Games/EA Games', 'Games/Origin Games', 'Games/Electronic Arts',
  'Program Files/EA Games', 'Program Files (x86)/EA Games',
  'Program Files/Origin Games', 'Program Files (x86)/Origin Games',
  'Program Files/Electronic Arts', 'Program Files (x86)/Electronic Arts',
  'SteamLibrary/steamapps/common', 'Steam/steamapps/common',
  'Games/Steam/steamapps/common', 'Program Files/Steam/steamapps/common',
  'Program Files (x86)/Steam/steamapps/common',
];
const SKIP_ROOTS = new Set([
  '$recycle.bin', 'windows', 'users', 'programdata', 'program files',
  'program files (x86)', 'system volume information', 'recovery', 'boot',
  'documents and settings', 'perflogs', 'msocache',
]);

function normalizeInstallPath(value) {
  let candidate = value && typeof value === 'object' ? value.value : value;
  if (typeof candidate !== 'string') return undefined;
  const env = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k.toLowerCase(), v]));
  candidate = candidate.replace(/\0/g, '').trim().replace(/%([^%]+)%/g,
    (original, key) => env[key.toLowerCase()] || original);
  if (candidate.startsWith('"')) {
    const end = candidate.indexOf('"', 1);
    if (end < 0) return undefined;
    candidate = candidate.slice(1, end);
  } else {
    // DisplayIcon may include an icon index. Do not truncate arbitrary folder names.
    candidate = candidate.replace(/(\.exe)(?:,\s*-?\d+|\s+.*)$/i, '$1');
  }
  if (!path.isAbsolute(candidate)) return undefined;
  candidate = path.resolve(candidate);
  if (path.basename(candidate).toLowerCase() === GAME_EXE) candidate = path.dirname(candidate);
  return candidate;
}

async function isFile(filePath) {
  try { return (await fs.statAsync(filePath)).isFile(); } catch (_) { return false; }
}

async function isGamePath(value) {
  const candidate = normalizeInstallPath(value);
  if (!candidate) return false;
  const found = await Promise.all([GAME_EXE, GAME_DATA].map(name => isFile(path.join(candidate, name))));
  return found.every(Boolean);
}

async function firstValid(candidates) {
  const seen = new Set();
  for (const value of candidates) {
    const candidate = normalizeInstallPath(value);
    if (!candidate || seen.has(candidate.toLowerCase())) continue;
    seen.add(candidate.toLowerCase());
    if (await isGamePath(candidate)) return candidate;
  }
  return undefined;
}

function registryCandidates() {
  if (!winapi || typeof winapi.RegGetValue !== 'function') return [];
  const candidates = [];
  for (const hive of ['HKEY_LOCAL_MACHINE', 'HKEY_CURRENT_USER']) {
    for (const view of ['SOFTWARE\\', 'SOFTWARE\\WOW6432Node\\']) {
      for (const base of REGISTRY_BASES) {
        for (const value of REGISTRY_VALUES) {
          try { candidates.push(winapi.RegGetValue(hive, view + base, value)); } catch (_) { /* Absent key. */ }
        }
      }
    }
  }
  return candidates;
}

async function findAcrossDrives() {
  if (process.platform !== 'win32') return undefined;
  for (let code = 65; code <= 90; code += 1) {
    const root = `${String.fromCharCode(code)}:\\`;
    let entries;
    try { entries = await fs.readdirAsync(root); } catch (_) { continue; }
    const candidates = LIBRARIES.map(base => path.join(root, ...base.split('/'), GAME_NAME));
    // Bounded library search: do not recursively crawl users' disks.
    for (const entry of entries.filter(name => !SKIP_ROOTS.has(name.toLowerCase())).sort().slice(0, 128)) {
      for (const library of ['', 'Games', 'EA Games', 'Origin Games', 'Electronic Arts', 'steamapps/common', 'SteamLibrary/steamapps/common']) {
        candidates.push(path.join(root, entry, ...library.split('/'), GAME_NAME));
      }
    }
    const found = await firstValid(candidates);
    if (found) return found;
  }
  return undefined;
}

async function findGame() {
  const helper = util.GameStoreHelper;
  const methods = [
    ['Steam', async () => {
      const game = await helper.findByAppId([STEAM_APP_ID], 'steam');
      return firstValid([game && game.gamePath]);
    }],
    ['EA App / Origin', async () => {
      const game = await helper.findByName(['Dead Space 3', 'Dead Space™ 3'], 'origin');
      return firstValid([game && game.gamePath]);
    }],
    ['EA / retail registry', () => firstValid(registryCandidates())],
    ['mounted-drive library search', findAcrossDrives],
  ];
  for (const [method, find] of methods) {
    try {
      const result = await find();
      if (result) {
        log('info', `${GAME_NAME}: found using ${method}`, { path: result });
        return result;
      }
    } catch (error) {
      log('debug', `${GAME_NAME}: ${method} discovery unavailable`, { error: error.message });
    }
  }
  throw new Error(`Dead Space 3 was not found automatically. Set its location in Games to the folder containing ${GAME_EXE} and ${GAME_DATA}.`);
}

function archiveEntries(files) {
  return files.map(source => {
    if (typeof source !== 'string') throw new Error('Invalid archive entry.');
    const directory = /[\\/]$/.test(source);
    const parts = source.replace(/\\/g, '/').split('/');
    if (directory) parts.pop();
    if (parts.length === 0 || parts.some(part => !part || part === '.' || part === '..'
        || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part)
        || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
      throw new Error(`This archive contains an unsafe or unsupported Windows path: ${source}`);
    }
    return { source, parts, directory };
  }).filter(entry => !entry.directory && !entry.parts.some(part =>
    part === '__MACOSX' || part === '.DS_Store' || part.startsWith('._')));
}

function isDocumentation(entry) {
  return /^(read[ _-]?me|license|licence|changelog|changes|credits|installation|instructions)(?:[ ._-]|$)/i
    .test(entry.parts[entry.parts.length - 1]);
}

function isPayload(entry) {
  const name = entry.parts[entry.parts.length - 1];
  return ROOT_EXTENSIONS.has(path.extname(name).toLowerCase())
    || /^bigfile\d+\.(viv|patch)$/i.test(name)
    || entry.parts.some(part => ROOT_FOLDERS.has(part.toLowerCase()));
}

function hasFomod(files) {
  return files.some(file => /(^|[\\/])fomod[\\/](moduleconfig\.xml|script\.cs)$/i.test(file));
}

function wrapperDepth(entries) {
  const payload = entries.filter(entry => !isDocumentation(entry));
  if (payload.length === 0) return 0;
  let depth = 0;
  while (payload.every(entry => entry.parts.length > depth + 1)) {
    const name = payload[0].parts[depth].toLowerCase();
    if (ROOT_FOLDERS.has(name) || !payload.every(entry => entry.parts[depth].toLowerCase() === name)) break;
    depth += 1;
  }
  return depth;
}

function testSupported(files, gameId) {
  if (gameId !== GAME_ID || hasFomod(files)) return Promise.resolve({ supported: false, requiredFiles: [] });
  // Let installContent report invalid paths, rather than letting a generic
  // installer silently handle an archive we otherwise recognise.
  const supported = files.some(file => !/[\\/]$/.test(file)
    && isPayload({ parts: file.replace(/\\/g, '/').split('/') }));
  return Promise.resolve({ supported, requiredFiles: [] });
}

async function installContent(api, files) {
  const entries = archiveEntries(files);
  const depth = wrapperDepth(entries);
  const prefix = depth ? entries.find(entry => !isDocumentation(entry)).parts.slice(0, depth) : [];
  const destinations = new Set();
  let textures = false;
  const instructions = entries.map(entry => {
    const insideWrapper = prefix.every((part, i) => entry.parts[i] && part.toLowerCase() === entry.parts[i].toLowerCase());
    const parts = insideWrapper ? entry.parts.slice(depth) : entry.parts;
    const name = parts[parts.length - 1];
    if (/^bigfile\d+\.patch$/i.test(name) || /^ds(?:3|_easy)patcher\.(?:bat|cmd|exe)$/i.test(name)) {
      throw new Error('This package needs a patcher that changes the original bigfile archives. Follow its author\'s manual instructions; Vortex cannot apply or undo that patch safely.');
    }
    if (parts.length === 1 && name.toLowerCase() === GAME_EXE) {
      throw new Error('This package replaces deadspace3.exe. Review the author\'s store-specific instructions and install it manually; this extension does not replace the game executable.');
    }
    if (/\.(ds3|sav|save)$/i.test(name) || /^settings\.txt$/i.test(name)) {
      throw new Error('This package includes saved games or user settings. Install those manually in the location specified by its author; this extension deploys game-folder mods.');
    }
    if (/\.tpf$/i.test(name)) {
      textures = true;
      if (parts[0].toLowerCase() !== TEXMOD_DIRECTORY.toLowerCase()) parts.unshift(TEXMOD_DIRECTORY);
    }
    const destination = path.join(...parts);
    const key = destination.toLowerCase();
    if (destinations.has(key)) throw new Error(`Archive files would overwrite one another: ${destination}`);
    destinations.add(key);
    return { type: 'copy', source: entry.source, destination };
  });
  if (instructions.length === 0) throw new Error('This archive contains no installable files.');
  if (textures) {
    api.sendNotification({
      id: 'deadspace3-texmod-help', type: 'info', allowSuppress: true,
      message: `TexMod textures are stored in "${TEXMOD_DIRECTORY}" inside the game folder. Select them in TexMod and launch deadspace3.exe through TexMod using instructions for your store. Vortex manages the files; TexMod performs texture injection.`,
    });
  }
  return { instructions };
}

async function setup(api, discovery) {
  if (!discovery || !await isGamePath(discovery.path)) {
    throw new Error(`Select the Dead Space 3 folder containing ${GAME_EXE} and ${GAME_DATA}.`);
  }
  api.sendNotification({
    id: 'deadspace3-modding-help', type: 'info', allowSuppress: true,
    message: 'Dead Space 3 mods deploy beside deadspace3.exe. Keep the Vortex staging folder on the same drive as the game for hardlink deployment. TexMod textures require a store-compatible launch.',
  });
}

function main(context) {
  context.registerGame({
    id: GAME_ID, name: GAME_NAME, mergeMods: true, logo: 'gameart.png',
    executable: () => GAME_EXE, requiredFiles: [GAME_EXE, GAME_DATA],
    queryPath: findGame, queryModPath: () => '.', supportedTools: [],
    setup: discovery => setup(context.api, discovery),
    details: { steamAppId: Number(STEAM_APP_ID), nexusPageId: GAME_ID },
  });
  context.registerInstaller('deadspace3-root-and-texmod', 25, testSupported,
    files => installContent(context.api, files));
  return true;
}

module.exports = { default: main };
