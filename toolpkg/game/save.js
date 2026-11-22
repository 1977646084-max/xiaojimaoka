'use strict';

function isCafe(state) {
  return state?.version === 1 && Array.isArray(state.cats) && Array.isArray(state.candidates)
    && Number.isFinite(state.coins) && typeof state.shop_name === 'string'
    && typeof state.assistant?.name === 'string';
}

function openStore(configDir, files) {
  const dir = configDir.replace(/\/+$/, '');
  const slotPath = (slot) => dir + '/cafe-save-' + slot + '.json';

  async function read() {
    const records = [];
    let found = false;
    for (const slot of [0, 1]) {
      const path = slotPath(slot);
      if (!(await files.exists(path)).exists) continue;
      found = true;
      const { content } = await files.read(path);
      let candidate;
      try {
        candidate = JSON.parse(content);
      } catch {
        continue;
      }
      if (Number.isSafeInteger(candidate?.revision) && candidate.revision > 0
          && candidate.revision % 2 === slot && isCafe(candidate.state)) {
        records.push(candidate);
      }
    }
    if (records.length) {
      return records.reduce((latest, record) => latest.revision > record.revision ? latest : record);
    }
    if (found) throw new Error('猫咖存档无法读取，请保留存档文件并检查内容。');
    const legacy = dir + '/save.json';
    if (!(await files.exists(legacy)).exists) return { revision: 0, state: null };
    const { content } = await files.read(legacy);
    const state = JSON.parse(content);
    if (!isCafe(state)) throw new Error('猫咖 save.json 格式不符，无法导入。');
    return { revision: 0, state };
  }

  async function write(record) {
    if (!(await files.exists(dir)).exists) {
      const folder = await files.mkdir(dir, true);
      if (!folder.successful) throw new Error('无法建立猫咖存档目录。');
    }
    // Preserve the last valid revision if a write is interrupted.
    const result = await files.write(slotPath(record.revision % 2), JSON.stringify(record), false);
    if (!result.successful) throw new Error('猫咖存档写入失败，请重试。');
  }

  return { read, write };
}

module.exports = { openStore };
