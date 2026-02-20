import { describe, expect, test } from 'vitest'
import { MetadataCondition, parseMetadataQuery } from '../utility'

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
