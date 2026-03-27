import { describe, expect, it } from 'vitest';
import type { SchemaField } from '../JsonBuilder';
import { schemaToTree, treeToJson, treeToSchema } from '../JsonBuilder';

describe('schemaToTree', () => {
  it('returns empty array for undefined schema', () => {
    expect(schemaToTree(undefined)).toEqual([]);
  });

  it('returns empty array for schema without properties', () => {
    expect(schemaToTree({ type: 'object' })).toEqual([]);
  });

  it('parses flat string/number/boolean fields', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'User name' },
        age: { type: 'number' },
        active: { type: 'boolean' },
      },
    };
    const tree = schemaToTree(schema);
    expect(tree).toHaveLength(3);
    expect(tree[0]).toMatchObject({ name: 'name', type: 'string', description: 'User name' });
    expect(tree[1]).toMatchObject({ name: 'age', type: 'number' });
    expect(tree[2]).toMatchObject({ name: 'active', type: 'boolean' });
  });

  it('parses default values', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'John' },
        count: { type: 'number', default: 42 },
      },
    };
    const tree = schemaToTree(schema);
    expect(tree[0].default).toBe('John');
    expect(tree[1].default).toBe(42);
  });

  it('parses nested object 2 levels deep', () => {
    const schema = {
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: {
            city: { type: 'string' },
            zip: { type: 'string' },
          },
        },
      },
    };
    const tree = schemaToTree(schema);
    expect(tree[0].type).toBe('object');
    expect(tree[0].properties).toHaveLength(2);
    expect(tree[0].properties![0].name).toBe('city');
  });

  it('parses nested object 3+ levels deep', () => {
    const schema = {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            address: {
              type: 'object',
              properties: {
                geo: {
                  type: 'object',
                  properties: {
                    lat: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    };
    const tree = schemaToTree(schema);
    expect(tree[0].properties![0].properties![0].properties![0].name).toBe('lat');
  });

  it('parses array of strings', () => {
    const schema = {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' } },
      },
    };
    const tree = schemaToTree(schema);
    expect(tree[0].type).toBe('array');
    expect(tree[0].items?.type).toBe('string');
  });

  it('parses array of objects with properties', () => {
    const schema = {
      type: 'object',
      properties: {
        orders: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              name: { type: 'string' },
            },
          },
        },
      },
    };
    const tree = schemaToTree(schema);
    expect(tree[0].items?.type).toBe('object');
    expect(tree[0].items?.properties).toHaveLength(2);
    expect(tree[0].items?.properties?.[0].name).toBe('id');
  });
});

describe('treeToSchema', () => {
  it('returns undefined for empty fields', () => {
    expect(treeToSchema([])).toBeUndefined();
  });

  it('filters empty names', () => {
    const fields: SchemaField[] = [
      { name: '', type: 'string', description: '' },
      { name: 'valid', type: 'string', description: '' },
    ];
    const schema = treeToSchema(fields);
    expect(Object.keys(schema!.properties)).toEqual(['valid']);
  });

  it('serializes default values', () => {
    const fields: SchemaField[] = [
      { name: 'name', type: 'string', description: '', default: 'John' },
      { name: 'count', type: 'number', description: '', default: 42 },
    ];
    const schema = treeToSchema(fields);
    expect(schema!.properties.name.default).toBe('John');
    expect(schema!.properties.count.default).toBe(42);
  });

  it('skips empty/undefined defaults', () => {
    const fields: SchemaField[] = [
      { name: 'name', type: 'string', description: '', default: undefined },
      { name: 'other', type: 'string', description: '', default: '' },
    ];
    const schema = treeToSchema(fields);
    expect(schema!.properties.name.default).toBeUndefined();
    expect(schema!.properties.other.default).toBeUndefined();
  });

  it('serializes nested objects', () => {
    const fields: SchemaField[] = [
      {
        name: 'address',
        type: 'object',
        description: '',
        properties: [{ name: 'city', type: 'string', description: '' }],
      },
    ];
    const schema = treeToSchema(fields);
    expect(schema!.properties.address.properties.city.type).toBe('string');
  });

  it('serializes array of strings', () => {
    const fields: SchemaField[] = [
      {
        name: 'tags',
        type: 'array',
        description: '',
        items: { name: 'items', type: 'string', description: '' },
      },
    ];
    const schema = treeToSchema(fields);
    expect(schema!.properties.tags.items.type).toBe('string');
  });

  it('serializes array of objects', () => {
    const fields: SchemaField[] = [
      {
        name: 'orders',
        type: 'array',
        description: '',
        items: {
          name: 'items',
          type: 'object',
          description: '',
          properties: [{ name: 'id', type: 'number', description: '' }],
        },
      },
    ];
    const schema = treeToSchema(fields);
    expect(schema!.properties.orders.items.properties.id.type).toBe('number');
  });
});

describe('treeToJson', () => {
  it('converts flat fields to JSON values', () => {
    const fields: SchemaField[] = [
      { name: 'name', type: 'string', description: '', default: 'John' },
    ];
    expect(treeToJson(fields)).toEqual({ name: 'John' });
  });

  it('converts nested objects recursively', () => {
    const fields: SchemaField[] = [
      {
        name: 'address',
        type: 'object',
        description: '',
        properties: [
          { name: 'city', type: 'string', description: '', default: 'Sydney' },
        ],
      },
    ];
    expect(treeToJson(fields)).toEqual({ address: { city: 'Sydney' } });
  });

  it('preserves boolean and number types', () => {
    const fields: SchemaField[] = [
      { name: 'active', type: 'boolean', description: '', default: true },
      { name: 'count', type: 'number', description: '', default: 42 },
    ];
    const result = treeToJson(fields);
    expect(result.active).toBe(true);
    expect(result.count).toBe(42);
  });

  it('filters out fields with empty names', () => {
    const fields: SchemaField[] = [
      { name: '', type: 'string', description: '', default: 'skip' },
      { name: 'valid', type: 'string', description: '', default: 'keep' },
    ];
    const result = treeToJson(fields);
    expect(Object.keys(result)).toEqual(['valid']);
    expect(result.valid).toBe('keep');
  });

  it('uses default fallbacks for undefined defaults', () => {
    const fields: SchemaField[] = [
      { name: 'text', type: 'string', description: '' },
      { name: 'num', type: 'number', description: '' },
      { name: 'flag', type: 'boolean', description: '' },
    ];
    const result = treeToJson(fields);
    expect(result.text).toBe('');
    expect(result.num).toBe(0);
    expect(result.flag).toBe(false);
  });
});

describe('round-trip', () => {
  it('flat properties survive round-trip', () => {
    const original = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'User name', default: 'John' },
        age: { type: 'number' },
      },
    };
    const result = treeToSchema(schemaToTree(original));
    expect(result!.properties.name).toEqual(original.properties.name);
    expect(result!.properties.age.type).toBe('number');
  });

  it('nested objects survive round-trip', () => {
    const original = {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            address: {
              type: 'object',
              properties: {
                city: { type: 'string' },
              },
            },
          },
        },
      },
    };
    const result = treeToSchema(schemaToTree(original));
    expect(result!.properties.user.properties.address.properties.city.type).toBe('string');
  });

  it('array of objects survives round-trip', () => {
    const original = {
      type: 'object',
      properties: {
        orders: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              tags: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    };
    const result = treeToSchema(schemaToTree(original));
    expect(result!.properties.orders.items.properties.id.type).toBe('number');
    expect(result!.properties.orders.items.properties.tags.items.type).toBe('string');
  });

  it('complex schema survives round-trip', () => {
    const original = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'test' },
        config: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            rules: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  pattern: { type: 'string' },
                  priority: { type: 'number' },
                },
              },
            },
          },
        },
      },
    };
    const result = treeToSchema(schemaToTree(original));
    expect(result!.properties.name.default).toBe('test');
    expect(result!.properties.config.properties.enabled.type).toBe('boolean');
    expect(result!.properties.config.properties.rules.items.properties.pattern.type).toBe('string');
  });
});
