// src/common/decorators/is-buffer.decorator.ts
import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

export function IsBuffer(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'IsBuffer',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          return Buffer.isBuffer(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a Buffer`;
        },
      },
    });
  };
}
