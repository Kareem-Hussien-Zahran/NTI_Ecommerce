import { errMsg, idOf, nameOf } from './models';

describe('model helpers', () => {
  it('errMsg prefers the first validation detail, then the message, then the fallback', () => {
    expect(
      errMsg({
        error: {
          message: 'Validation failed',
          details: [{ field: 'email', message: 'Invalid email' }],
        },
      }),
    ).toBe('email: Invalid email');
    expect(errMsg({ error: { message: 'Nope' } })).toBe('Nope');
    expect(errMsg({}, 'fallback')).toBe('fallback');
    expect(errMsg(null)).toBe('Something went wrong');
  });
  it('nameOf / idOf handle populated and plain references', () => {
    expect(nameOf({ _id: '1', name: 'Acme', slug: 'acme' })).toBe('Acme');
    expect(nameOf('1')).toBe('');
    expect(nameOf(null)).toBe('');
    expect(idOf({ _id: '1', name: 'A', slug: 'a' })).toBe('1');
    expect(idOf('2')).toBe('2');
  });
});
