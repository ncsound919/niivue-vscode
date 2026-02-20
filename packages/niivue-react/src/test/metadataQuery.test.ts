import { describe, expect, test } from 'vitest'
import { MetadataCondition, evaluateMetadataQuery, parseMetadataQuery } from '../utility'

describe('parseMetadataQuery', () => {
  test('returns empty array for empty query', () => {
    expect(parseMetadataQuery('')).toEqual([])
    expect(parseMetadataQuery('   ')).toEqual([])
  })

  test('parses a single numeric condition', () => {
    const result = parseMetadataQuery('nx > 100')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject<MetadataCondition>({
      field: 'nx',
      operator: '>',
      value: 100,
    })
  })

  test('parses all numeric operators', () => {
    const ops = ['>', '<', '>=', '<=', '='] as const
    for (const op of ops) {
      const result = parseMetadataQuery(`nx ${op} 64`)
      expect(result[0].operator).toBe(op)
    }
  })

  test('parses a contains condition', () => {
    const result = parseMetadataQuery("name contains 'mni'")
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject<MetadataCondition>({
      field: 'name',
      operator: 'contains',
      value: 'mni',
    })
  })

  test('parses multiple conditions joined by AND', () => {
    const result = parseMetadataQuery("nx > 64 AND name contains 'mni'")
    expect(result).toHaveLength(2)
    expect(result[0].field).toBe('nx')
    expect(result[1].field).toBe('name')
  })

  test('parses AND case-insensitively', () => {
    const result = parseMetadataQuery('nx > 10 and ny < 200')
    expect(result).toHaveLength(2)
  })

  test('ignores malformed conditions', () => {
    const result = parseMetadataQuery('not a valid condition')
    expect(result).toHaveLength(0)
  })

  test('parses negative numbers', () => {
    const result = parseMetadataQuery('nx > -5')
    expect(result[0].value).toBe(-5)
  })

  test('parses floating-point thresholds', () => {
    const result = parseMetadataQuery('dx > 1.5')
    expect(result[0].value).toBe(1.5)
  })
})

describe('evaluateMetadataQuery', () => {
  const makeNv = (meta: Record<string, any>, name = '') =>
    ({
      volumes: name || Object.keys(meta).length > 0
        ? [{ name, getImageMetadata: () => meta }]
        : [],
      meshes: [],
    }) as any

  test('returns true for empty query', () => {
    expect(evaluateMetadataQuery(makeNv({}), '')).toBe(true)
    expect(evaluateMetadataQuery(makeNv({}), '   ')).toBe(true)
  })

  test('returns true for unparseable (incomplete) query — no silent hide', () => {
    // Malformed/incomplete queries should not silently filter volumes
    expect(evaluateMetadataQuery(makeNv({ nx: 128 }), 'garbage text')).toBe(true)
    expect(evaluateMetadataQuery(makeNv({ nx: 128 }), 'nx >')).toBe(true)
  })

  test('evaluates numeric greater-than condition', () => {
    expect(evaluateMetadataQuery(makeNv({ nx: 128 }), 'nx > 64')).toBe(true)
    expect(evaluateMetadataQuery(makeNv({ nx: 32 }), 'nx > 64')).toBe(false)
  })

  test('evaluates numeric less-than condition', () => {
    expect(evaluateMetadataQuery(makeNv({ nx: 32 }), 'nx < 64')).toBe(true)
    expect(evaluateMetadataQuery(makeNv({ nx: 128 }), 'nx < 64')).toBe(false)
  })

  test('evaluates equals condition', () => {
    expect(evaluateMetadataQuery(makeNv({ nx: 64 }), 'nx = 64')).toBe(true)
    expect(evaluateMetadataQuery(makeNv({ nx: 32 }), 'nx = 64')).toBe(false)
  })

  test('evaluates contains condition on name field', () => {
    expect(evaluateMetadataQuery(makeNv({}, 'mni152.nii'), "name contains 'mni'")).toBe(true)
    expect(evaluateMetadataQuery(makeNv({}, 'subject01.nii'), "name contains 'mni'")).toBe(false)
  })

  test('evaluates multiple AND conditions', () => {
    expect(evaluateMetadataQuery(makeNv({ nx: 128, ny: 128 }), 'nx > 64 AND ny > 64')).toBe(true)
    expect(evaluateMetadataQuery(makeNv({ nx: 32, ny: 128 }), 'nx > 64 AND ny > 64')).toBe(false)
  })

  test('returns false when field does not exist in metadata', () => {
    expect(evaluateMetadataQuery(makeNv({}), 'nx > 64')).toBe(false)
  })
})
