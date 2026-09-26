import { camelizeKeys } from '../../src/utils/serialization';

describe('camelizeKeys', () => {
  it('converts top-level snake_case keys to camelCase', () => {
    expect(camelizeKeys({ error_message: 'oops', created_at: '2024-01-01' })).toEqual({
      errorMessage: 'oops',
      createdAt: '2024-01-01'
    });
  });

  it('leaves already-camelCase and single-word keys unchanged', () => {
    expect(camelizeKeys({ id: '1', filename: 'a.txt', alreadyCamel: true })).toEqual({
      id: '1',
      filename: 'a.txt',
      alreadyCamel: true
    });
  });

  it('recurses into nested objects and arrays', () => {
    const input = {
      document_id: 'doc_1',
      messages: [{ conversation_id: 'conv_1', role: 'user' }]
    };
    expect(camelizeKeys(input)).toEqual({
      documentId: 'doc_1',
      messages: [{ conversationId: 'conv_1', role: 'user' }]
    });
  });

  it('passes through primitives and null unchanged', () => {
    expect(camelizeKeys(null)).toBeNull();
    expect(camelizeKeys(42)).toBe(42);
    expect(camelizeKeys('plain')).toBe('plain');
  });
});
