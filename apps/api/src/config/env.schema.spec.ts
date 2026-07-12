import { envValidationSchema } from './env.schema';

describe('environment schema', () => {
  const retentionSchema = envValidationSchema.extract('CHATROOM_RETENTION_DAYS');

  it('defaults chatroom retention to 180 days', () => {
    const result = retentionSchema.validate(undefined);

    expect(result.error).toBeUndefined();
    expect(result.value).toBe(180);
  });

  it.each([29, 3651, 30.5])('rejects invalid chatroom retention value %s', (value) => {
    expect(retentionSchema.validate(value).error).toBeDefined();
  });

  it.each([30, 180, 3650])('accepts chatroom retention value %s', (value) => {
    const result = retentionSchema.validate(value);

    expect(result.error).toBeUndefined();
    expect(result.value).toBe(value);
  });
});
