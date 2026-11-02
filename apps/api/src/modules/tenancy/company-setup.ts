import { BadRequestException } from '@nestjs/common';

export type CompanySetup = {
  legalName: string;
  tradeName: string | null;
  gstin: string | null;
  stateCode: string | null;
  billingEmail: string | null;
  billingAddress: { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string };
};

const states: Record<string, string> = {
  '01':'Jammu and Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh',
  '05':'Uttarakhand','06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh',
  '10':'Bihar','11':'Sikkim','12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur',
  '15':'Mizoram','16':'Tripura','17':'Meghalaya','18':'Assam','19':'West Bengal',
  '20':'Jharkhand','21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh',
  '24':'Gujarat','25':'Daman and Diu (legacy)','26':'Dadra and Nagar Haveli and Daman and Diu',
  '27':'Maharashtra','28':'Andhra Pradesh (legacy)','29':'Karnataka','30':'Goa',
  '31':'Lakshadweep','32':'Kerala','33':'Tamil Nadu','34':'Puducherry',
  '35':'Andaman and Nicobar Islands','36':'Telangana','37':'Andhra Pradesh',
  '38':'Ladakh','97':'Other Territory'
};

export function validateCompanySetup(input: unknown): CompanySetup {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new BadRequestException('Invalid company details');
  const data = input as Record<string, unknown>;
  const fields = ['legalName','tradeName','gstin','stateCode','billingEmail'] as const;
  if (Object.keys(data).some(key => ![...fields,'billingAddress'].includes(key)))
    throw new BadRequestException('Unsupported company details');
  function text(field: typeof fields[number], max: number, required = false): string | null {
    const value = data[field];
    if (value == null || value === '') {
      if (required) throw new BadRequestException('Company legal name is required');
      return null;
    }
    if (typeof value !== 'string') throw new BadRequestException('Invalid ' + field);
    const trimmed = value.trim();
    if ((required && trimmed.length < 2) || trimmed.length > max)
      throw new BadRequestException('Invalid ' + field);
    return trimmed || null;
  }
  const legalName = text('legalName',200,true)!;
  const tradeName = text('tradeName',200);
  const gstin = text('gstin',15)?.toUpperCase() ?? null;
  const stateCode = text('stateCode',2);
  const billingEmail = text('billingEmail',254)?.toLowerCase() ?? null;
  if (stateCode && !states[stateCode]) throw new BadRequestException('Invalid state code');
  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin))
    throw new BadRequestException('Invalid GSTIN format');
  if (gstin && stateCode && gstin.slice(0,2) !== stateCode)
    throw new BadRequestException('GSTIN state and company state must match');
  if (billingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail))
    throw new BadRequestException('Invalid billing email');
  const addressInput = data.billingAddress ?? {};
  if (!addressInput || typeof addressInput !== 'object' || Array.isArray(addressInput))
    throw new BadRequestException('Invalid billing address');
  const address: CompanySetup['billingAddress'] = {};
  for (const [key, value] of Object.entries(addressInput)) {
    if (!['line1','line2','city','state','postalCode'].includes(key) ||
        typeof value !== 'string' || value.trim().length > 200)
      throw new BadRequestException('Invalid billing address');
    address[key as keyof typeof address] = value.trim();
  }
  if (gstin && !stateCode) throw new BadRequestException('Select the company state for a GST-registered business');
  return {legalName,tradeName,gstin,stateCode,billingEmail,billingAddress:address};
}

export const indianStateOptions = states;
