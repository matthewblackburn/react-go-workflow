import { describe, expect, it } from 'vitest';
import { detectFrequency, parseCronParts } from '../CronBuilder';

describe('detectFrequency', () => {
  it('detects minute frequency for wildcard minute and hour', () => {
    expect(detectFrequency('* * * * *')).toBe('minute');
  });

  it('detects hourly frequency for */N minute patterns', () => {
    expect(detectFrequency('*/5 * * * *')).toBe('hourly');
  });

  it('detects hourly frequency', () => {
    expect(detectFrequency('30 * * * *')).toBe('hourly');
  });

  it('detects daily frequency', () => {
    expect(detectFrequency('0 9 * * *')).toBe('daily');
  });

  it('detects weekly frequency', () => {
    expect(detectFrequency('0 9 * * 1')).toBe('weekly');
  });

  it('detects monthly frequency', () => {
    expect(detectFrequency('0 9 15 * *')).toBe('monthly');
  });

  it('returns custom for non-standard expressions', () => {
    expect(detectFrequency('weird expression')).toBe('custom');
  });

  it('returns daily for empty string', () => {
    expect(detectFrequency('')).toBe('daily');
  });
});

describe('parseCronParts', () => {
  it('extracts correct parts from a valid expression', () => {
    const parts = parseCronParts('30 9 * * 1');
    expect(parts.minute).toBe('30');
    expect(parts.hour).toBe('9');
    expect(parts.dayOfMonth).toBe('*');
    expect(parts.dayOfWeek).toBe('1');
  });

  it('extracts everyMinutes from */N pattern', () => {
    const parts = parseCronParts('*/10 * * * *');
    expect(parts.everyMinutes).toBe('10');
  });

  it('defaults everyMinutes to 5 when minute is not */N', () => {
    const parts = parseCronParts('30 9 * * *');
    expect(parts.everyMinutes).toBe('5');
  });

  it('returns defaults for malformed input', () => {
    const parts = parseCronParts('not a cron');
    expect(parts.minute).toBe('0');
    expect(parts.hour).toBe('9');
    expect(parts.dayOfMonth).toBe('1');
    expect(parts.dayOfWeek).toBe('1');
    expect(parts.everyMinutes).toBe('5');
  });
});
