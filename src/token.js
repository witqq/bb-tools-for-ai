import fs from 'fs';
import {execSync} from 'child_process';
import path from 'path';

const TOKEN_FILE = path.join(process.cwd(), '.token');

/**
 * Получаем уникальный ID машины (hostname + username)
 * Используется как ключ для XOR шифрования
 */
function getMachineKey() {
  try {
    const hostname = execSync('hostname', {encoding: 'utf8'}).trim();
    const username = process.env.USER || process.env.USERNAME || 'default';
    return `${hostname}-${username}`;
  } catch (e) {
    return 'default-machine-key';
  }
}

/**
 * XOR шифрование/дешифрование строки
 */
function xorCipher(text, key) {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

/**
 * Шифрование токена: XOR + base64
 */
export function encryptToken(token) {
  const key = getMachineKey();
  const encrypted = xorCipher(token, key);
  return Buffer.from(encrypted).toString('base64');
}

/**
 * Дешифрование токена: base64 + XOR
 */
export function decryptToken(encryptedToken) {
  const key = getMachineKey();
  const encrypted = Buffer.from(encryptedToken, 'base64').toString('utf8');
  return xorCipher(encrypted, key);
}

/**
 * Сохранить токен в файл
 */
export function saveToken(token) {
  const encrypted = encryptToken(token);
  fs.writeFileSync(TOKEN_FILE, encrypted, 'utf8');
  console.log('✓ Token saved to .token file');
}

/**
 * Прочитать токен из файла
 */
export function loadToken() {
  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error('.token file not found. Run: bb setup');
  }
  const encrypted = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  const token = decryptToken(encrypted);

  // Validate token contains only printable ASCII characters
  // eslint-disable-next-line no-control-regex
  const invalidChars = token.match(/[\x00-\x1F\x7F-\xFF]/g);
  if (invalidChars) {
    const codes = [...new Set(invalidChars)].map(c => `0x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
    throw new Error(
      `Token contains invalid characters: ${codes.join(', ')}. ` +
      `This usually means the token was corrupted or machine key changed. ` +
      `Run: bb setup`
    );
  }

  if (!token || token.length < 10) {
    throw new Error('Token is empty or too short. Run: bb setup');
  }

  return token;
}

/**
 * Проверить существование токена
 */
export function hasToken() {
  return fs.existsSync(TOKEN_FILE);
}
