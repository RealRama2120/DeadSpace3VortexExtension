'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sourcePath = process.env.DS3_EXTENSION_SOURCE || path.resolve(__dirname, '..', 'index.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const win = path.win32;
const key = value => win.normalize(value).toLowerCase();

function load(options = {}) {
  const registered = { notifications: [], games: [], installers: [], probes: [], logs: [] };
  const existing = new Set((options.files || []).map(key));
  const dirs = new Map(Object.entries(options.dirs || {}).map(([k, v]) => [key(k), v]));
  const missing = () => { throw Object.assign(new Error('not found'), { code: 'ENOENT' }); };
  const fakeFs = options.fs || {
    statAsync: async p => {
      registered.probes.push(p);
      if (!existing.has(key(p))) return missing();
      return { isFile: () => true };
    },
    readdirAsync: async p => {
      registered.probes.push(p);
      if (!dirs.has(key(p))) return missing();
      return dirs.get(key(p));
    },
  };
  const vortex = {
    fs: fakeFs,
    log: (...args) => registered.logs.push(args),
    util: { GameStoreHelper: {
      findByAppId: async (ids, store) => {
        assert.deepEqual(Array.from(ids), ['1238060']);
        assert.equal(store, 'steam');
        if (!options.steam) return missing();
        return { gamePath: options.steam };
      },
      findByName: async (names, store) => {
        assert.equal(store, 'origin');
        assert.ok(names.includes('Dead Space 3'));
        if (!options.ea) return missing();
        return { gamePath: options.ea };
      },
    } },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports,
    process: { platform: 'win32', env: options.env || process.env },
    require: name => {
      if (name === 'path') return win;
      if (name === 'vortex-api') return vortex;
      if (name === 'winapi-bindings') {
        if (options.noRegistry) return missing();
        return { RegGetValue: (hive, location, value) => {
          const found = (options.registry || {})[`${hive}|${location}|${value}`];
          if (found === undefined) return missing();
          return found;
        } };
      }
      throw new Error(`Undeclared dependency ${name}`);
    },
  }, { filename: sourcePath });
  assert.equal(module.exports.default({
    api: { sendNotification: notification => registered.notifications.push(notification) },
    registerGame: game => registered.games.push(game),
    registerInstaller: (id, priority, supported, install) => registered.installers.push({ id, priority, supported, install }),
  }), true);
  registered.game = registered.games[0];
  registered.installer = registered.installers[0];
  return registered;
}

const gameFiles = root => ['deadspace3.exe', 'bigfile0.viv'].map(file => win.join(root, file));
const plain = value => JSON.parse(JSON.stringify(value));

test('registers only Dead Space 3 with root deployment and validated launch target', () => {
  const { game, games, installers } = load();
  assert.equal(games.length, 1);
  assert.equal(installers.length, 1);
  assert.equal(game.id, 'deadspace3');
  assert.equal(game.name, 'Dead Space 3');
  assert.equal(game.executable(), 'deadspace3.exe');
  assert.equal(game.queryModPath(), '.');
  assert.equal(game.mergeMods, true);
  assert.deepEqual(plain(game.requiredFiles), ['deadspace3.exe', 'bigfile0.viv']);
  assert.equal(game.details.steamAppId, 1238060);
  assert.equal(game.details.nexusPageId, 'deadspace3');
});

test('Steam discovery accepts a custom library on another drive', async () => {
  const root = 'F:\\Custom Library\\Dead Space 3';
  const r = load({ steam: root, files: gameFiles(root) });
  assert.equal(await r.game.queryPath(), root);
});

test('stale Steam path falls through to EA App entry', async () => {
  const root = 'D:\\EA Games\\Dead Space 3';
  const r = load({ steam: 'C:\\Missing', ea: root, files: gameFiles(root) });
  assert.equal(await r.game.queryPath(), root);
});

for (const location of ['SOFTWARE\\Electronic Arts\\Dead Space 3', 'SOFTWARE\\WOW6432Node\\EA Games\\Dead Space 3']) {
  test(`registry discovery: ${location}`, async () => {
    const root = 'D:\\EA Games\\Dead Space 3';
    const r = load({ files: gameFiles(root), registry: {
      [`HKEY_LOCAL_MACHINE|${location}|Install Dir`]: { value: root + '\\' },
    } });
    assert.equal(await r.game.queryPath(), root);
  });
}

test('quoted DisplayIcon with environment variable resolves to game directory', async () => {
  const root = 'D:\\Games\\Dead Space 3';
  const r = load({ files: gameFiles(root), env: { GAMES: 'D:\\Games' }, registry: {
    'HKEY_CURRENT_USER|SOFTWARE\\EA Games\\Dead Space 3|DisplayIcon': '"%games%\\Dead Space 3\\deadspace3.exe",0',
  } });
  assert.equal(await r.game.queryPath(), root);
});

test('all-drive fallback reaches Z without requiring registry bindings', async () => {
  const root = 'Z:\\Custom Library\\EA Games\\Dead Space 3';
  const r = load({ noRegistry: true, files: gameFiles(root), dirs: { 'Z:\\': ['Custom Library'] } });
  assert.equal(await r.game.queryPath(), root);
  assert.ok(r.probes.includes('A:\\'));
  assert.ok(r.probes.includes('Z:\\'));
});

test('incomplete / incorrect installations are rejected', async () => {
  for (const files of [[], ['C:\\Game\\deadspace3.exe'], ['C:\\Game\\bigfile0.viv'], ['C:\\Game\\Dead Space.exe']]) {
    const r = load({ steam: 'C:\\Game', files });
    await assert.rejects(r.game.queryPath(), /not found automatically/);
    await assert.rejects(r.game.setup({ path: 'C:\\Game' }), /Select the Dead Space 3 folder/);
  }
});

test('setup validates the installation without writing or changing permissions', async () => {
  const root = 'C:\\Game';
  const r = load({ files: gameFiles(root) });
  await r.game.setup({ path: root });
  assert.equal(r.notifications.length, 1);
  assert.equal(r.notifications[0].id, 'deadspace3-modding-help');
});

test('installer is restricted to deadspace3 and defers FOMOD packages', async () => {
  const { installer } = load();
  assert.equal((await installer.supported(['dinput8.dll'], 'deadspace3')).supported, true);
  for (const id of ['deadspace', 'deadspace2', 'deadspace2023', undefined]) {
    assert.equal((await installer.supported(['dinput8.dll'], id)).supported, false);
  }
  for (const file of ['fomod/ModuleConfig.xml', 'Wrapper\\fomod\\script.cs']) {
    assert.equal((await installer.supported(['dinput8.dll', file], 'deadspace3')).supported, false);
  }
  assert.equal((await installer.supported(['setup.exe'], 'deadspace3')).supported, false);
});

const layouts = [
  ['root DLL', ['dinput8.dll', 'MouseFix.ini'], ['dinput8.dll', 'MouseFix.ini']],
  ['MarkerPatch-style package', ['dinput8.dll', 'plugins/MarkerPatch.asi', 'plugins/MarkerPatch.ini', 'plugins/achievements/1.png'], ['dinput8.dll', 'plugins/MarkerPatch.asi', 'plugins/MarkerPatch.ini', 'plugins/achievements/1.png']],
  ['plugins-only package', ['plugins/DS3FirstPerson.asi', 'plugins/DS3FirstPerson.ini'], ['plugins/DS3FirstPerson.asi', 'plugins/DS3FirstPerson.ini']],
  ['wrapped plugins-only package', ['Release/plugins/MarkerPatch.asi'], ['plugins/MarkerPatch.asi']],
  ['nested wrappers', ['Mod v1/Dead Space 3/dinput8.dll', 'Mod v1/Dead Space 3/plugins/Fix.asi'], ['dinput8.dll', 'plugins/Fix.asi']],
  ['readme outside wrapper', ['Readme.txt', 'Release/dinput8.dll', 'Release/plugins/Fix.asi'], ['Readme.txt', 'dinput8.dll', 'plugins/Fix.asi']],
  ['ReShade folders', ['reshade-shaders/Shaders/Test.fx', 'reshade-shaders/Textures/Test.png'], ['reshade-shaders/Shaders/Test.fx', 'reshade-shaders/Textures/Test.png']],
  ['SweetFX folder', ['SweetFX/SweetFX_settings.txt', 'SweetFX/Shaders/Test.fx'], ['SweetFX/SweetFX_settings.txt', 'SweetFX/Shaders/Test.fx']],
  ['VIV replacement', ['Release/bigfile2.viv'], ['bigfile2.viv']],
  ['intro video replacement', ['Release/attract.vp6'], ['attract.vp6']],
  ['Core folder preserved', ['Pack/Core/codecs/example.dll'], ['Core/codecs/example.dll']],
  ['standalone TexMod', ['Skin.tpf'], ['TexMod Packages/Skin.tpf']],
  ['mixed TexMod and root mod', ['Pack/Skin.tpf', 'Pack/d3d9.dll', 'Pack/ReShade.ini', 'Pack/Readme.txt'], ['TexMod Packages/Skin.tpf', 'd3d9.dll', 'ReShade.ini', 'Readme.txt']],
  ['texture filename collisions preserved by subfolder', ['Pack/A/Skin.tpf', 'Pack/B/Skin.tpf'], ['TexMod Packages/A/Skin.tpf', 'TexMod Packages/B/Skin.tpf']],
  ['already routed TexMod', ['TexMod Packages/Skin.tpf'], ['TexMod Packages/Skin.tpf']],
  ['Windows separators', ['Release\\plugins\\Fix.asi'], ['plugins/Fix.asi']],
  ['directory entries', ['Pack/', 'Pack/plugins/', 'Pack/plugins/Fix.asi'], ['plugins/Fix.asi']],
  ['Mac metadata', ['Pack/Fix.dll', '__MACOSX/._Fix.dll', '.DS_Store'], ['Fix.dll']],
];

for (const [name, files, expected] of layouts) {
  test(`install layout: ${name}`, async () => {
    const r = load();
    assert.equal((await r.installer.supported(files, 'deadspace3')).supported, true);
    const result = await r.installer.install(files);
    assert.deepEqual(Array.from(result.instructions, i => i.destination.replace(/\\/g, '/')), expected);
    assert.ok(result.instructions.every(i => i.type === 'copy' && files.includes(i.source)));
    assert.equal(r.notifications.length, files.some(file => /\.tpf$/i.test(file)) ? 1 : 0);
  });
}

for (const name of ['../escape.dll', '/absolute.dll', 'C:\\escape.dll', '\\\\server\\share\\a.dll', 'a/../bad.dll', 'a//bad.dll', 'bad.dll:stream', 'CON.dll', 'folder./a.dll', 'folder /a.dll', 'a/./bad.dll', 'bad\0.dll']) {
  test(`rejects unsafe archive path: ${JSON.stringify(name)}`, async () => {
    await assert.rejects(load().installer.install([name]), /unsafe or unsupported Windows path/);
  });
}

test('rejects case-insensitive destination collisions', async () => {
  await assert.rejects(load().installer.install(['Skin.tpf', 'TexMod Packages/skin.tpf']), /overwrite one another/);
  await assert.rejects(load().installer.install(['Fix.dll', 'fix.DLL']), /overwrite one another/);
});

test('mixed save / user settings bundles are not sent to the game root', async () => {
  for (const file of ['ds_slot_01.ds3', 'settings.txt', 'slot.sav']) {
    await assert.rejects(load().installer.install(['Fix.dll', file]), /saved games or user settings/);
  }
});

test('game archive patchers and executable replacements require manual installation', async () => {
  for (const files of [
    ['bigfile0.patch'],
    ['Patch/bigfile0.patch', 'Patch/DS_EasyPatcher.bat'],
    ['DS3Patcher.bat'],
    ['Patch/install.cmd', 'Patch/Readme.txt'],
    ['Patch/install.ps1', 'Patch/bigfile2.viv'],
    ['DS3Patcher.exe'],
    ['dinput8.dll', 'deadspace3.exe'],
  ]) {
    const r = load();
    assert.equal((await r.installer.supported(files, 'deadspace3')).supported, true);
    await assert.rejects(r.installer.install(files), /manual|manually/);
  }
});

test('copy instructions can be staged and hardlinked, then removed in an isolated fixture', async () => {
  const base = path.resolve(__dirname, '..', 'test-artifacts');
  fs.mkdirSync(base, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(base, 'deployment-'));
  const payload = ['Example/dinput8.dll', 'Example/plugins/Fix.asi', 'Example/plugins/Fix.ini', 'Example/Skin.tpf'];
  const instructions = (await load().installer.install(payload)).instructions;
  try {
    for (const entry of instructions) {
      const archive = path.join(fixture, 'archive', entry.source);
      const staged = path.join(fixture, 'staging', entry.destination);
      const deployed = path.join(fixture, 'game', entry.destination);
      for (const file of [archive, staged, deployed]) fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(archive, `Harmless test content for ${entry.source}`);
      fs.copyFileSync(archive, staged);
      fs.linkSync(staged, deployed);
      assert.equal(fs.readFileSync(deployed, 'utf8'), fs.readFileSync(archive, 'utf8'));
      assert.equal(fs.statSync(staged).ino, fs.statSync(deployed).ino);
      fs.unlinkSync(deployed);
      assert.equal(fs.existsSync(deployed), false);
      assert.equal(fs.existsSync(staged), true);
    }
  } finally {
    const resolved = path.resolve(fixture);
    assert.ok(resolved.startsWith(base + path.sep));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});

test('read-only detection of the installed Steam game', { skip: !process.env.DS3_LIVE_PATH }, async () => {
  const root = process.env.DS3_LIVE_PATH;
  const r = load({ fs: { statAsync: fs.promises.stat, readdirAsync: fs.promises.readdir }, noRegistry: true });
  // Game-store adapters deliberately return no entries: exercise the extension's
  // real mounted-drive fallback, without reading or modifying Vortex user state.
  assert.equal(key(await r.game.queryPath()), key(root));
  await r.game.setup({ path: root });
});
