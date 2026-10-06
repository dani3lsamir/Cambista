// Cambista — tests for the Spanish / English texts
// Copyright (c) 2026 dani3lsamir. All rights reserved.
import { describe, it, expect } from 'vitest';
import { t, setLanguage, TEXT_KEYS } from '../src/i18n.js';

describe('i18n', () => {
  it('has the same keys in Spanish and English', () => {
    expect([...TEXT_KEYS.en].sort()).toEqual([...TEXT_KEYS.es].sort());
  });
  it('switches language and fills in values', () => {
    setLanguage('es');
    expect(t('minAgo', { n: 5 })).toBe('hace 5 min');
    setLanguage('en');
    expect(t('minAgo', { n: 5 })).toBe('5 min ago');
    expect(t('settings')).toBe('Settings');
    setLanguage('es');
  });
});
