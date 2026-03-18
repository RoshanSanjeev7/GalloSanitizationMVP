import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import type { User, Line, Template, Checklist, Notification } from '../types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = resolve(__dirname, '../../data.json');

interface StoreData {
  users: User[];
  lines: Line[];
  templates: Template[];
  checklists: Checklist[];
  notifications: Notification[];
}

let data: StoreData = {
  users: [],
  lines: [],
  templates: [],
  checklists: [],
  notifications: [],
};

export function load(): void {
  if (existsSync(DATA_FILE)) {
    try {
      const raw = readFileSync(DATA_FILE, 'utf-8');
      data = { notifications: [], ...JSON.parse(raw) };
    } catch {
      console.warn('Could not parse data.json, starting fresh');
    }
  }
}

export function save(): void {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function getStore(): StoreData {
  return data;
}

export function setStore(newData: StoreData): void {
  data = newData;
  save();
}
