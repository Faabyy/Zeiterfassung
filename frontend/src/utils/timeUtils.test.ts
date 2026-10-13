import { describe, expect, it } from 'vitest'
import { formatHours, parseTimeInput } from './timeUtils'

describe('parseTimeInput', () => {
  it.each([
    ['8', '08:00'],
    ['08', '08:00'],
    ['830', '08:30'],
    ['0830', '08:30'],
    ['8:30', '08:30'],
    ['8.30', '08:30'],
    ['15:42', '15:42'],
    [' 1542 ', '15:42'],
    ['0', '00:00'],
    ['23:59', '23:59'],
  ])('"%s" ergibt %s', (input, expected) => {
    expect(parseTimeInput(input)).toBe(expected)
  })

  it.each(['', 'abc', '24', '24:00', '8:60', '860', '12345', '8:3', '8:30:00'])(
    '"%s" ist ungültig',
    (input) => {
      expect(parseTimeInput(input)).toBeNull()
    },
  )
})

describe('formatHours', () => {
  it.each([
    [510, '8:30'],
    [45, '0:45'],
    [1260, '21:00'],
    [0, '–'],
  ])('%i Minuten ergeben %s', (minutes, expected) => {
    expect(formatHours(minutes)).toBe(expected)
  })
})
