import { Transform } from 'class-transformer';

export const SanitizeString = () => 
  Transform(({ value }) => {
    if (typeof value === 'string') {
      return value
        .replace(/<[^>]*>/g, '')
        .replace(/[<>"'&]/g, '')
        .trim();
    }
    return value;
  });

export const SanitizeEmail = () =>
  Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase().trim();
    }
    return value;
});