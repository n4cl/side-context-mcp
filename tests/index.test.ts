import { describe, expect, it } from 'vitest';
import { placeholderMessage } from '../src/index.js';

describe('placeholderMessage', () => {
  it('returns a placeholder message', () => {
    // テスト目的: 開発環境が正しく初期化されていることを簡易確認する。
    expect(placeholderMessage()).toBe('side-context-mcp TypeScript environment ready');
  });
});
