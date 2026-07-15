'use client';

import type { ReactNode } from 'react';
import type { UseFormRegister, FieldErrors } from 'react-hook-form';
import { FieldLabel, FieldError, TextInput } from '../settings/shared';

export interface AddressFormValues {
  addressLine1: string;
  addressLine2?: string;
  addressCity: string;
  addressState?: string;
  addressPostcode: string;
  addressCountry: string;
}

interface Props {
  register: UseFormRegister<any>;
  errors: FieldErrors<AddressFormValues>;
  /**
   * Reserved slot rendered above the manual fields — a postcode/address
   * lookup can be dropped in here later and prefill the fields below, which
   * remain the source of truth for submission.
   */
  lookupSlot?: ReactNode;
}

export function AddressFields({ register, errors, lookupSlot }: Props) {
  return (
    <div className="space-y-4">
      {lookupSlot}
      <div>
        <FieldLabel htmlFor="addressLine1">Address line 1</FieldLabel>
        <TextInput id="addressLine1" placeholder="Unit 3, Vintners Yard" autoComplete="address-line1" {...register('addressLine1')} />
        <FieldError message={errors.addressLine1?.message} />
      </div>
      <div>
        <FieldLabel htmlFor="addressLine2">Address line 2 (optional)</FieldLabel>
        <TextInput id="addressLine2" autoComplete="address-line2" {...register('addressLine2')} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="addressCity">City</FieldLabel>
          <TextInput id="addressCity" placeholder="Leeds" autoComplete="address-level2" {...register('addressCity')} />
          <FieldError message={errors.addressCity?.message} />
        </div>
        <div>
          <FieldLabel htmlFor="addressState">County / state (optional)</FieldLabel>
          <TextInput id="addressState" autoComplete="address-level1" {...register('addressState')} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="addressPostcode">Postcode</FieldLabel>
          <TextInput id="addressPostcode" placeholder="LS1 4AP" autoComplete="postal-code" {...register('addressPostcode')} />
          <FieldError message={errors.addressPostcode?.message} />
        </div>
        <div>
          <FieldLabel htmlFor="addressCountry">Country</FieldLabel>
          <TextInput id="addressCountry" placeholder="United Kingdom" autoComplete="country-name" {...register('addressCountry')} />
          <FieldError message={errors.addressCountry?.message} />
        </div>
      </div>
    </div>
  );
}
