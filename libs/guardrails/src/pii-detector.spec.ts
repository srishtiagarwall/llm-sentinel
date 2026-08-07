import { scanForPii } from './pii-detector';

describe('scanForPii', () => {
  it('returns not-detected for text with no PII', () => {
    const result = scanForPii('The quick brown fox jumps over the lazy dog.');
    expect(result).toEqual({ detected: false, types: [], redacted: 'The quick brown fox jumps over the lazy dog.' });
  });

  it('returns not-detected for an empty string', () => {
    expect(scanForPii('')).toEqual({ detected: false, types: [], redacted: '' });
  });

  it('detects an email address and redacts it', () => {
    const result = scanForPii('Contact me at jane.doe@example.com for details.');
    expect(result.detected).toBe(true);
    expect(result.types).toContain('EMAIL');
    expect(result.redacted).toBe('Contact me at [REDACTED:EMAIL] for details.');
  });

  it('detects a US phone number', () => {
    const result = scanForPii('Call (415) 555-0132 anytime.');
    expect(result.detected).toBe(true);
    expect(result.types).toContain('PHONE');
  });

  it('detects an SSN', () => {
    const result = scanForPii('SSN: 123-45-6789');
    expect(result.detected).toBe(true);
    expect(result.types).toContain('SSN');
    expect(result.redacted).toContain('[REDACTED:SSN]');
  });

  it('detects a credit card number', () => {
    const result = scanForPii('Card number 4111 1111 1111 1111 was declined.');
    expect(result.detected).toBe(true);
    expect(result.types).toContain('CREDIT_CARD');
  });

  it('detects an IP address', () => {
    const result = scanForPii('Client connected from 192.168.1.42.');
    expect(result.detected).toBe(true);
    expect(result.types).toContain('IP_ADDRESS');
  });

  it('detects an Aadhaar-formatted number', () => {
    const result = scanForPii('Aadhaar: 1234 5678 9123');
    expect(result.detected).toBe(true);
    expect(result.types).toContain('AADHAAR');
  });

  it('detects a PAN-formatted string', () => {
    const result = scanForPii('PAN: ABCDE1234F on file.');
    expect(result.detected).toBe(true);
    expect(result.types).toContain('PAN');
  });

  it('detects and redacts multiple PII types present in the same text', () => {
    const result = scanForPii('Email jane@example.com or call (415) 555-0132.');
    expect(result.detected).toBe(true);
    expect(result.types).toEqual(expect.arrayContaining(['EMAIL', 'PHONE']));
    expect(result.redacted).not.toContain('jane@example.com');
    expect(result.redacted).not.toContain('(415) 555-0132');
  });

  it('produces stable results across repeated calls (no shared regex lastIndex state leaking between calls)', () => {
    const withPii = scanForPii('jane@example.com');
    const withoutPii = scanForPii('no pii here');
    const withPiiAgain = scanForPii('jane@example.com');

    expect(withPii.detected).toBe(true);
    expect(withoutPii.detected).toBe(false);
    expect(withPiiAgain.detected).toBe(true);
    expect(withPiiAgain.types).toEqual(withPii.types);
  });
});
